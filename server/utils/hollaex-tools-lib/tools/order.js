'use strict';

const { getUserByKitId, getUserByEmail, getUserByNetworkId, mapNetworkIdToKitId, mapKitIdToNetworkId } = require('./user');
const { SERVER_PATH } = require('../constants');
const { getModel } = require('./database/model');
const { fetchBrokerQuote, generateRandomToken, isFairPriceForBroker } = require('./broker');
const { getNodeLib } = require(`${SERVER_PATH}/init`);
const { INVALID_SYMBOL, NO_DATA_FOR_CSV, USER_NOT_FOUND, USER_NOT_REGISTERED_ON_NETWORK, TOKEN_EXPIRED, BROKER_NOT_FOUND, BROKER_PAUSED, BROKER_SIZE_EXCEED, QUICK_TRADE_ORDER_CAN_NOT_BE_FILLED, QUICK_TRADE_ORDER_CURRENT_PRICE_ERROR, QUICK_TRADE_VALUE_IS_TOO_SMALL, FAIR_PRICE_BROKER_ERROR, AMOUNT_NEGATIVE_ERROR, QUICK_TRADE_CONFIG_NOT_FOUND, QUICK_TRADE_TYPE_NOT_SUPPORTED, PRICE_NOT_FOUND, INVALID_PRICE, INVALID_SIZE } = require(`${SERVER_PATH}/messages`);
const { parse } = require('json2csv');
const { subscribedToPair, getKitTier, getDefaultFees, getAssetsPrices, getPublicTrades, getQuickTrades, validatePair } = require('./common');
const { reject } = require('bluebird');
const { loggerOrders } = require(`${SERVER_PATH}/config/logger`);
const math = require('mathjs');
const { has } = require('lodash');
const { setPriceEssentials, getDecimals } = require('../../orderbook');
const { getUserBalanceByKitId } = require('./wallet');
const { verifyBearerTokenPromise } = require('./security');
const { client } = require('./database/redis');
const { parseNumber } = require('./common');
const BigNumber = require('bignumber.js');

const createUserOrderByKitId = (userKitId, symbol, side, size, type, price = 0, opts = { stop: null, meta: null, additionalHeaders: null }) => {
	if (symbol && !subscribedToPair(symbol)) {
		return reject(new Error(INVALID_SYMBOL(symbol)));
	}
	return getUserByKitId(userKitId)
		.then((user) => {
			if (!user) {
				throw new Error(USER_NOT_FOUND);
			} else if (!user.network_id) {
				throw new Error(USER_NOT_REGISTERED_ON_NETWORK);
			}

			const feeData = generateOrderFeeData(
				user.verification_level,
				symbol,
				{
					discount: user.discount
				}
			);

			return getNodeLib().createOrder(user.network_id, symbol, side, size, type, price, feeData, opts);
		});
};

const executeUserOrder = async (user_id, opts, token) => {
	const storedToken = await client.getAsync(token);
	if (!storedToken) {
		throw new Error(TOKEN_EXPIRED);
	}
	const { symbol, price, side, size, type } = JSON.parse(storedToken);

	if (size < 0) {
		throw new Error(INVALID_SIZE);
	} 

	if (price < 0) {
		throw new Error(INVALID_PRICE);
	} 

	let res;
	if (type === 'market') {
		res = await createUserOrderByKitId(user_id, symbol, side, size, type, 0, opts);
	}
	else if (type === 'broker') {
		const brokerPair = await getModel('broker').findOne({ where: { symbol } });

		if (!brokerPair) {
			throw new Error(BROKER_NOT_FOUND);
		} else if (brokerPair.paused) {
			throw new Error(BROKER_PAUSED);
		}

		if(size < brokerPair.min_size || size > brokerPair.max_size) {
			throw new Error(BROKER_SIZE_EXCEED)
		}

		const broker = await getUserByKitId(brokerPair.user_id);
		const user = await getUserByKitId(user_id);

		const isFairPrice = await isFairPriceForBroker(brokerPair);

		if (!isFairPrice) {
			throw new Error(FAIR_PRICE_BROKER_ERROR);
		}

		const tierBroker = getKitTier(broker.verification_level);
		const tierUser = getKitTier(user.verification_level);

		const makerFee = tierBroker.fees.maker[symbol];
		const takerFee = tierUser.fees.taker[symbol];

		res = await getNodeLib().createBrokerTrade(
			symbol,
			side,
			price,
			size,
			broker.network_id,
			user.network_id,
			{ maker: makerFee, taker: takerFee }
		);
	}
	else if (type === 'network') {
		const user = await getUserByKitId(user_id);
		const tierUser = getKitTier(user.verification_level);
		const fee = tierUser.fees.taker[symbol];

		res = await getNodeLib().executeQuote(token, user.network_id, fee, opts);
	}
	else {
		throw new Error(QUICK_TRADE_TYPE_NOT_SUPPORTED);
	}
	await client.delAsync(token);
	res.type = type;
	return res;
}

const getUserQuickTrade = async (spending_currency, spending_amount, receiving_amount, receiving_currency, bearerToken, ip, opts) => {

	if (spending_amount) spending_amount = new BigNumber(spending_amount).toNumber();
	if (receiving_amount) receiving_amount = new BigNumber(receiving_amount).toNumber();

	if (receiving_amount < 0 || spending_amount < 0) {
		throw new Error(AMOUNT_NEGATIVE_ERROR);
	}
	const originalPair = `${spending_currency}-${receiving_currency}`;
	const flippedPair = `${receiving_currency}-${spending_currency}`;

	let symbol = originalPair;
	let side = 'sell';

	const quickTrades = getQuickTrades();
	let quickTradeConfig = quickTrades.find(quickTrade => quickTrade.symbol === originalPair);

	if (!quickTradeConfig) {
		quickTradeConfig = quickTrades.find(quickTrade => quickTrade.symbol === flippedPair);
		symbol = flippedPair;
		side = 'buy';
	}
	if (!quickTradeConfig) throw new Error(QUICK_TRADE_CONFIG_NOT_FOUND);

	if (quickTradeConfig && quickTradeConfig.active && quickTradeConfig.type === 'broker') {
		const broker = await getModel('broker').findOne({ where: { symbol } });

		if (!broker) {
			throw new Error(BROKER_NOT_FOUND);
		}
		if (broker.paused) {
			throw new Error(BROKER_PAUSED);
		}

		return fetchBrokerQuote({
			symbol: symbol,
			side: side,
			bearerToken,
			ip,
			orderData: {
				spending_currency,
				receiving_currency,
				spending_amount,
				receiving_amount
			}
		})
			.then((brokerQuote) => {
				const responseObj = {
					spending_currency,
					receiving_currency,
					...(spending_amount != null ? { spending_amount } : { receiving_amount }),
					token: brokerQuote?.token,
					expiry: brokerQuote?.expiry,
					type: 'broker'
				}
				if (spending_amount != null) {
					responseObj.receiving_amount = brokerQuote.receiving_amount;
				} else if (receiving_amount != null) {
					responseObj.spending_amount = brokerQuote.spending_amount;;
				}
				
				const baseCoinSize = side === 'buy' ? responseObj.receiving_amount : responseObj.spending_amount;
				if (baseCoinSize < broker.min_size || baseCoinSize > broker.max_size) {
					throw new Error(BROKER_SIZE_EXCEED)
				}

				if (responseObj.receiving_amount < 0 || responseObj.spending_amount < 0) {
					throw new Error(PRICE_NOT_FOUND);
				}

				return responseObj;
			})
	}
	else if (quickTradeConfig && quickTradeConfig.active && quickTradeConfig.type === 'pro') {
		try {
		
			if (!subscribedToPair(symbol)) {
				return reject(new Error(INVALID_SYMBOL(symbol)));
			}

			const responseObj = {
				spending_currency,
				receiving_currency,
				...(spending_amount != null ? { spending_amount } : { receiving_amount }),
				type: 'market'
			}

			const priceValues = await setPriceEssentials({
				pair: symbol,
				size: spending_amount != null ? spending_amount : receiving_amount,
				side,
				...(spending_amount != null ? { sourceAmount: spending_amount } : { targetAmount: receiving_amount }),
				isSourceChanged: spending_amount != null ? true : false,
			}, opts);

			if (priceValues.estimatedPrice === 0) {
				throw new Error(QUICK_TRADE_ORDER_CAN_NOT_BE_FILLED);
			}

			if (priceValues.targetAmount === 0 || priceValues.sourceAmount === 0) {
				throw new Error(QUICK_TRADE_VALUE_IS_TOO_SMALL);
			}

			if (spending_amount != null) responseObj.receiving_amount = priceValues.targetAmount;
			else if (receiving_amount != null) responseObj.spending_amount = priceValues.sourceAmount;

			//Check if the estimated price is 50% greater than the last trade
			const lastTrades = await getPublicTrades(symbol);
			if (Array.isArray(lastTrades[symbol]) && lastTrades[symbol].length > 0) {
				const lastPrice = new BigNumber(lastTrades[symbol][0].price).multipliedBy(1.50).toNumber();

				if (priceValues.estimatedPrice > lastPrice) {
					throw new Error(QUICK_TRADE_ORDER_CURRENT_PRICE_ERROR);
				}
			}

			let user_id = null;
			if (bearerToken) {
				const auth = await verifyBearerTokenPromise(bearerToken, ip);
				if (auth) {
					user_id = auth.sub.id;
				}
			}

			if (user_id) {
				let size;
				if (`${spending_currency}-${receiving_currency}` === symbol) {
					size = responseObj.spending_amount;
				} else {
					size = responseObj.receiving_amount;
				}

				// Generate randomToken to be used during deal execution
				const randomToken = generateRandomToken(user_id, symbol, side, 30, priceValues?.estimatedPrice, size, 'market');
				responseObj.token = randomToken;
				// set expiry
				const expiryDate = new Date();
				expiryDate.setSeconds(expiryDate.getSeconds() + 30);
				responseObj.expiry = expiryDate;
			}

			return responseObj;
		} catch (err) {
			return reject(new Error(err.message));
		}
	}
	else if (quickTradeConfig && quickTradeConfig.active && quickTradeConfig.type === 'network') {

		let user_id = null;
		let network_id = null;
		if (bearerToken) {
			const auth = await verifyBearerTokenPromise(bearerToken, ip);
			if (auth) {
				user_id = auth.sub.id;
				network_id = auth.sub.networkId;
			}
		}

		const responseObj = {
			spending_currency,
			receiving_currency,
			spending_amount,
			receiving_amount,
			type: 'network'
		}

		const priceValues = await getNodeLib().getQuote(
			network_id,
			spending_currency,
			spending_amount,
			receiving_currency,
			receiving_amount,
			opts
		);

		responseObj.spending_amount = priceValues.spending_amount;
		responseObj.receiving_amount = priceValues.receiving_amount;
		if (responseObj.spending_amount === 0 || responseObj.receiving_amount === 0) { 
			throw new Error(QUICK_TRADE_VALUE_IS_TOO_SMALL);
		}

		if (user_id) {
			responseObj.expiry = priceValues.expiry;
			responseObj.token = priceValues.token;

			const tradeData = {
				user_id,
				symbol,
				type: 'network'
			};

			client.setexAsync(priceValues.token, 30, JSON.stringify(tradeData));
		}

		return responseObj;
	} 
	else {
		throw new Error(QUICK_TRADE_TYPE_NOT_SUPPORTED);
	}
}

const updateQuickTradeConfig = async ({ symbol, type, active }) => {
	const QuickTrade = getModel('quickTrade');

	const quickTradeData = await QuickTrade.findOne({ where: { symbol } });

	if (!quickTradeData) {
		throw new Error(QUICK_TRADE_CONFIG_NOT_FOUND);
	}

	const updatedConfig = {
		...quickTradeData.dataValues,
		type,
		active
	}
	return quickTradeData.update(updatedConfig, { fields: ['type', 'active'], returning: true });
}

const convertBalance = async (order, user_id, maker_id) => {
	const { symbol, side, price, size } = order;

	const admin = await getUserByKitId(maker_id);
	const user = await getUserByKitId(user_id);

	const makerFee = 0;
	const takerFee = 0;

	return getNodeLib().createBrokerTrade(
		symbol,
		side,
		price,
		size,
		admin.network_id,
		user.network_id,
		{ maker: makerFee, taker: takerFee }
	);
}



const dustPriceEstimate = async (user_id, opts, { assets, spread, maker_id, quote }) => {
	if (quote == null) throw new Error('quote undefined');
	if (spread == null) throw new Error('spread undefined');
	if (maker_id == null) throw new Error('maker_id undefined');

	const usdtPrices = await getAssetsPrices(assets, 'usdt', 1, opts);
	const quotePrices = await getAssetsPrices(assets, quote, 1, opts);

	const balance = await getUserBalanceByKitId(user_id, opts)

	let symbols = {};

	for (const key of Object.keys(balance)) {
		if (key.includes('available') && balance[key]) {
			let symbol = key?.split('_')?.[0]
			if (symbol && assets.includes(symbol)) {
				symbols[symbol] = balance[key];
			}
		}
	}

	let estimatedConversions = [];
	for (const coin of Object.keys(symbols)) {

		if (usdtPrices[coin] < 0 || quotePrices[coin] < 0) continue;

		let symbol = `${coin}-${quote}`;
		let side = 'sell';

		const usdtSize = parseNumber((usdtPrices[coin] * symbols[coin]), 10);
		const size = parseNumber(symbols[coin], 10);
		const price = parseNumber(quotePrices[coin] * (1 - (spread / 100)), 10);
		const quoteSize = parseNumber(price * size, 10);

		if (usdtSize < 1) {
			const orderData = {
				symbol,
				side,
				size,
				price,
				quoteSize
			}
			estimatedConversions.push(orderData);

		}
	}

	return estimatedConversions;
}

const dustUserBalance = async (user_id, opts, { assets, spread, maker_id, quote }) => {
	try {
		if (quote == null) throw new Error('quote undefined');
		if (spread == null) throw new Error('spread undefined');
		if (maker_id == null) throw new Error('maker_id undefined');

		const usdtPrices = await getAssetsPrices(assets, 'usdt', 1, opts);
		const quotePrices = await getAssetsPrices(assets, quote, 1, opts);

		const balance = await getUserBalanceByKitId(user_id, opts)

		let symbols = {};

		for (const key of Object.keys(balance)) {
			if (key.includes('available') && balance[key]) {
				let symbol = key?.split('_')?.[0]
				if (symbol && assets.includes(symbol)) {
					symbols[symbol] = balance[key];
				}
			}
		}

		let convertedAssets = [];
		for (const coin of Object.keys(symbols)) {

			if (usdtPrices[coin] < 0 || quotePrices[coin] < 0) continue;

			let symbol = `${coin}-${quote}`;
			let side = 'sell';

			const usdtSize = parseNumber(usdtPrices[coin] * symbols[coin], 10);
			const size = parseNumber(symbols[coin], 10);
			const price = parseNumber(quotePrices[coin] * (1 - (spread / 100)), 10);

			if (usdtSize < 1) {
				try {
					const orderData = {
						symbol,
						side,
						size,
						price
					}
					const res = await convertBalance(orderData, user_id, maker_id);
					convertedAssets.push(res);
				} catch (err) {
					convertedAssets.push({ error: err.message, symbol, side, size, price });
					loggerOrders.error(
						'dustUserBalance error',
						err.message,
					);
				}
			} else {
				convertedAssets.push({ error: 'value is not less than 1 usdt', symbol });
			}
		}

		return convertedAssets;

	} catch (err) {
		return reject(err);
	}
}

const createUserOrderByEmail = (email, symbol, side, size, type, price = 0, opts = { stop: null, meta: null, additionalHeaders: null }) => {
	if (symbol && !subscribedToPair(symbol)) {
		return reject(new Error(INVALID_SYMBOL(symbol)));
	}
	return getUserByEmail(email)
		.then((user) => {
			if (!user) {
				throw new Error(USER_NOT_FOUND);
			} else if (!user.network_id) {
				throw new Error(USER_NOT_REGISTERED_ON_NETWORK);
			}

			const feeData = generateOrderFeeData(
				user.verification_level,
				symbol,
				{
					discount: user.discount
				}
			);

			return getNodeLib().createOrder(user.network_id, symbol, side, size, type, price, feeData, opts);
		});
};

const createUserOrderByNetworkId = (networkId, symbol, side, size, type, price = 0, opts = { stop: null, meta: null, additionalHeaders: null }) => {
	if (!networkId) {
		return reject(new Error(USER_NOT_REGISTERED_ON_NETWORK));
	}
	if (symbol && !subscribedToPair(symbol)) {
		return reject(new Error(INVALID_SYMBOL(symbol)));
	}
	return getUserByNetworkId(networkId)
		.then((user) => {
			if (!user) {
				throw new Error(USER_NOT_FOUND);
			}

			const feeData = generateOrderFeeData(
				user.verification_level,
				symbol,
				{
					discount: user.discount
				}
			);

			return getNodeLib().createOrder(user.network_id, symbol, side, size, type, price, feeData, opts);
		});
};

const createOrderNetwork = (networkId, symbol, side, size, type, price, feeData = {}, opts = { stop: null, meta: null, additionalHeaders: null }) => {
	if (!networkId) {
		return reject(new Error(USER_NOT_REGISTERED_ON_NETWORK));
	}
	return getNodeLib().createOrder(networkId, symbol, side, size, type, price, feeData, opts);
};

const getUserOrderByKitId = async (userKitId, orderId, opts = {
	additionalHeaders: null
}) => {
	// check mapKitIdToNetworkId
	const idDictionary = await mapKitIdToNetworkId([userKitId]);

	if (!has(idDictionary, userKitId)) {
		throw new Error(USER_NOT_FOUND);
	} else if (!idDictionary[userKitId]) {
		throw new Error(USER_NOT_REGISTERED_ON_NETWORK);
	}

	return getNodeLib().getOrder(idDictionary[userKitId], orderId, opts);
};

const getUserOrderByEmail = (email, orderId, opts = {
	additionalHeaders: null
}) => {
	return getUserByEmail(email)
		.then((user) => {
			if (!user) {
				throw new Error(USER_NOT_FOUND);
			} else if (!user.network_id) {
				throw new Error(USER_NOT_REGISTERED_ON_NETWORK);
			}
			return getNodeLib().getOrder(user.network_id, orderId, opts);
		});
};

const getUserOrderByNetworkId = (networkId, orderId, opts = {
	additionalHeaders: null
}) => {
	if (!networkId) {
		return reject(new Error(USER_NOT_REGISTERED_ON_NETWORK));
	}
	return getNodeLib().getOrder(networkId, orderId, opts);
};

const cancelUserOrderByKitId = async (userKitId, orderId, opts = {
	additionalHeaders: null
}) => {
	// check mapKitIdToNetworkId
	const idDictionary = await mapKitIdToNetworkId([userKitId]);

	if (!has(idDictionary, userKitId)) {
		throw new Error(USER_NOT_FOUND);
	} else if (!idDictionary[userKitId]) {
		throw new Error(USER_NOT_REGISTERED_ON_NETWORK);
	}
	return getNodeLib().cancelOrder(idDictionary[userKitId], orderId, opts);
};

const cancelUserOrderByEmail = (email, orderId, opts = {
	additionalHeaders: null
}) => {
	return getUserByEmail(email)
		.then((user) => {
			if (!user) {
				throw new Error(USER_NOT_FOUND);
			} else if (!user.network_id) {
				throw new Error(USER_NOT_REGISTERED_ON_NETWORK);
			}
			return getNodeLib().cancelOrder(user.network_id, orderId, opts);
		});
};

const cancelUserOrderByNetworkId = (networkId, orderId, opts = {
	additionalHeaders: null
}) => {
	if (!networkId) {
		return reject(new Error(USER_NOT_REGISTERED_ON_NETWORK));
	}
	return getNodeLib().cancelOrder(networkId, orderId, opts);
};

const getAllExchangeOrders = (symbol, side, status, open, limit, page, orderBy, order, startDate, endDate, opts = {
	additionalHeaders: null
}) => {
	if (symbol && !subscribedToPair(symbol)) {
		return reject(new Error(INVALID_SYMBOL(symbol)));
	}
	return getNodeLib().getOrders({
		symbol,
		side,
		status,
		open,
		limit,
		page,
		orderBy,
		order,
		startDate,
		endDate,
		...opts
	})
	.then(async (orders) => {
		if (orders.data.length > 0) {
			const networkIds = orders.data.map((order) => order.created_by);
			const idDictionary = await mapNetworkIdToKitId(networkIds);
			for (let order of orders.data) {
				const user_kit_id = idDictionary[order.created_by];
				order.network_id = order.created_by;
				order.created_by = user_kit_id;
				if (order.User) order.User.id = user_kit_id;
			}
		}
		return orders;
	});
};

const getAllUserOrdersByKitId = async (userKitId, symbol, side, status, open, limit, page, orderBy, order, startDate, endDate, format, opts = {
	additionalHeaders: null
}) => {
	if (symbol && !subscribedToPair(symbol)) {
		return reject(new Error(INVALID_SYMBOL(symbol)));
	}
	// check mapKitIdToNetworkId
	const idDictionary = await mapKitIdToNetworkId([userKitId]);

	if (!has(idDictionary, userKitId)) {
		throw new Error(USER_NOT_FOUND);
	} else if (!idDictionary[userKitId]) {
		throw new Error(USER_NOT_REGISTERED_ON_NETWORK);
	}
	return getNodeLib().getUserOrders(idDictionary[userKitId], {
		symbol,
		side,
		status,
		open,
		limit,
		page,
		orderBy,
		order,
		startDate,
		endDate,
		...opts
	})
	.then(async (orders) => {
		if (orders.data.length > 0) {
			const networkIds = orders.data.map((order) => order.created_by);
			const idDictionary = await mapNetworkIdToKitId(networkIds);
			for (let order of orders.data) {
				const user_kit_id = idDictionary[order.created_by];
				order.network_id = order.created_by;
				order.created_by = user_kit_id;
				if (order.User) order.User.id = user_kit_id;
			}
		}

		if (format && format === 'csv') {
			if (orders.data.length === 0) {
				throw new Error(NO_DATA_FOR_CSV);
			}
			const csv = parse(orders.data, Object.keys(orders.data[0]));
			return csv;
		} else {
			return orders;
		}
	});
};

const getAllUserOrdersByEmail = (email, symbol, side, status, open, limit, page, orderBy, order, startDate, endDate, opts = {
	additionalHeaders: null
}) => {
	if (symbol && !subscribedToPair(symbol)) {
		return reject(new Error(INVALID_SYMBOL(symbol)));
	}
	return getUserByEmail(email)
		.then((user) => {
			if (!user) {
				throw new Error(USER_NOT_FOUND);
			} else if (!user.network_id) {
				throw new Error(USER_NOT_REGISTERED_ON_NETWORK);
			}
			return getNodeLib().getUserOrders(user.network_id, {
				symbol,
				side,
				status,
				open,
				limit,
				page,
				orderBy,
				order,
				startDate,
				endDate,
				...opts
			});
		});
};

const getAllUserOrdersByNetworkId = (networkId, symbol, side, status, open, limit, page, orderBy, order, startDate, endDate, opts = {
	additionalHeaders: null
}) => {
	if (!networkId) {
		return reject(new Error(USER_NOT_REGISTERED_ON_NETWORK));
	}
	if (symbol && !subscribedToPair(symbol)) {
		return reject(new Error(INVALID_SYMBOL(symbol)));
	}
	return getNodeLib().getUserOrders(networkId, {
		symbol,
		side,
		status,
		open,
		limit,
		page,
		orderBy,
		order,
		startDate,
		endDate,
		...opts
	});
};

const cancelAllUserOrdersByKitId = async (userKitId, symbol, opts = {
	additionalHeaders: null
}) => {
	if (!symbol || !subscribedToPair(symbol)) {
		return reject(new Error(INVALID_SYMBOL(symbol)));
	}
	// check mapKitIdToNetworkId
	const idDictionary = await mapKitIdToNetworkId([userKitId]);

	if (!has(idDictionary, userKitId)) {
		throw new Error(USER_NOT_FOUND);
	} else if (!idDictionary[userKitId]) {
		throw new Error(USER_NOT_REGISTERED_ON_NETWORK);
	}
	return getNodeLib().cancelAllOrders(idDictionary[userKitId], { symbol, ...opts });
};

const cancelAllUserOrdersByEmail = (email, symbol, opts = {
	additionalHeaders: null
}) => {
	if (symbol && !subscribedToPair(symbol)) {
		return reject(new Error(INVALID_SYMBOL(symbol)));
	}
	return getUserByEmail(email)
		.then((user) => {
			if (!user) {
				throw new Error(USER_NOT_FOUND);
			} else if (!user.network_id) {
				throw new Error(USER_NOT_REGISTERED_ON_NETWORK);
			}
			return getNodeLib().cancelAllOrders(user.network_id, { symbol, ...opts });
		});
};

const cancelAllUserOrdersByNetworkId = (networkId, symbol, opts = {
	additionalHeaders: null
}) => {
	if (!networkId) {
		return reject(new Error(USER_NOT_REGISTERED_ON_NETWORK));
	}
	if (symbol && !subscribedToPair(symbol)) {
		return reject(new Error(INVALID_SYMBOL(symbol)));
	}
	return getNodeLib().cancelAllOrders(networkId, { symbol, ...opts });
};

const getAllTradesNetwork = (symbol, limit, page, orderBy, order, startDate, endDate, format, opts = { additionalHeaders: null }) => {
	if (symbol && !subscribedToPair(symbol)) {
		return reject(new Error(INVALID_SYMBOL(symbol)));
	}

	const params = {
		symbol,
		limit,
		page,
		orderBy,
		order,
		startDate,
		endDate,
		...opts
	};

	if (format) {
		params.format = 'all';
	}

	return getNodeLib().getTrades(params)
		.then(async (trades) => {
			if (trades.data.length > 0) {
				const networkIds = [];
				for (const trade of trades.data) {
					if (trade.maker_id) {
						networkIds.push(trade.maker_id);
					}
					if (trade.taker_id) {
						networkIds.push(trade.taker_id);
					}
				}

				const idDictionary = await mapNetworkIdToKitId(networkIds);

				for (let trade of trades.data) {
					if (trade.maker_id) {
						const maker_kit_id = idDictionary[trade.maker_id] || 0;
						trade.maker_network_id = trade.maker_id;
						trade.maker_id = maker_kit_id;
					}
					if (trade.taker_id) {
						const taker_kit_id = idDictionary[trade.taker_id] || 0;
						trade.taker_network_id = trade.taker_id;
						trade.taker_id = taker_kit_id;
					}
				}
			}

			if (format === 'csv') {
				if (trades.data.length === 0) {
					throw new Error(NO_DATA_FOR_CSV);
				}
				const csv = parse(trades.data, Object.keys(trades.data[0]));
				return csv;
			} else {
				return trades;
			}
		});
};

const getAllUserTradesByKitId = async (userKitId, symbol, limit, page, orderBy, order, startDate, endDate, format, opts = {
	additionalHeaders: null
}) => {
	if (symbol && !subscribedToPair(symbol)) {
		return reject(new Error(INVALID_SYMBOL(symbol)));
	}
	// check mapKitIdToNetworkId
	const idDictionary = await mapKitIdToNetworkId([userKitId]);

	if (!has(idDictionary, userKitId)) {
		throw new Error(USER_NOT_FOUND);
	} else if (!idDictionary[userKitId]) {
		throw new Error(USER_NOT_REGISTERED_ON_NETWORK);
	}

	const params = {
		symbol,
		limit,
		page,
		orderBy,
		order,
		startDate,
		endDate,
		...opts
	};

	if (format) {
		params.format = 'all';
	}

	return getNodeLib().getUserTrades(idDictionary[userKitId], params)
		.then((trades) => {
			if (format === 'csv') {
				if (trades.data.length === 0) {
					throw new Error(NO_DATA_FOR_CSV);
				}
				const csv = parse(trades.data, Object.keys(trades.data[0]));
				return csv;
			} else {
				return trades;
			}
		});
};

// const getAllTradesNetworkStream = (opts = {
// 	symbol: null,
// 	limit: null,
// 	page: null,
// 	orderBy: null,
// 	order: null,
// 	startDate: null,
// 	endDate: null
// }) => {
// 	if (opts.symbol && !subscribedToPair(opts.symbol)) {
// 		return reject(new Error(INVALID_SYMBOL(opts.symbol)));
// 	}
// 	return getNodeLib().getTrades({ ...opts, format: 'all' });
// };

// const getAllTradesNetworkCsv = (opts = {
// 	symbol: null,
// 	limit: null,
// 	page: null,
// 	orderBy: null,
// 	order: null,
// 	startDate: null,
// 	endDate: null
// }) => {
// 	return getAllTradesNetworkStream(opts)
// 		.then((data) => {
// 			const parser = getCsvParser();

// 			parser.on('error', (error) => {
// 				throw error;
// 			});

// 			parser.on('error', (error) => {
// 				parser.destroy();
// 				throw error;
// 			});

// 			parser.on('end', () => {
// 				parser.destroy();
// 			});

// 			return data.pipe(parser);
// 		});
// };

// const getUserTradesByKitIdStream = (userKitId, opts = {
// 	symbol: null,
// 	limit: null,
// 	page: null,
// 	orderBy: null,
// 	order: null,
// 	startDate: null,
// 	endDate: null
// }) => {
// 	if (opts.symbol && !subscribedToPair(opts.symbol)) {
// 		return reject(new Error(INVALID_SYMBOL(opts.symbol)));
// 	}
// 	return getUserByKitId(userKitId)
// 		.then((user) => {
// 			if (!user) {
// 				throw new Error(USER_NOT_FOUND);
// 			} else if (!user.network_id) {
// 				throw new Error(USER_NOT_REGISTERED_ON_NETWORK);
// 			}
// 			return getNodeLib().getUserTrades(user.network_id, { ...opts, format: 'all' });
// 		});
// };

// const getUserTradesByKitIdCsv = (userKitId, opts = {
// 	symbol: null,
// 	limit: null,
// 	page: null,
// 	orderBy: null,
// 	order: null,
// 	startDate: null,
// 	endDate: null
// }) => {
// 	return getUserTradesByKitIdStream(userKitId, opts)
// 		.then((data) => {
// 			const parser = getCsvParser();

// 			parser.on('error', (error) => {
// 				parser.destroy();
// 				throw error;
// 			});

// 			parser.on('end', () => {
// 				parser.destroy();
// 			});

// 			return data.pipe(parser);
// 		});
// };

// const getUserTradesByNetworkIdStream = (userNetworkId, opts = {
// 	symbol: null,
// 	limit: null,
// 	page: null,
// 	orderBy: null,
// 	order: null,
// 	startDate: null,
// 	endDate: null
// }) => {
// 	if (opts.symbol && !subscribedToPair(opts.symbol)) {
// 		return reject(new Error(INVALID_SYMBOL(opts.symbol)));
// 	}
// 	return getNodeLib().getUserTrades(userNetworkId, { ...opts, format: 'all' });
// };

// const getUserTradesByNetworkIdCsv = (userNetworkId, opts = {
// 	symbol: null,
// 	limit: null,
// 	page: null,
// 	orderBy: null,
// 	order: null,
// 	startDate: null,
// 	endDate: null
// }) => {
// 	return getUserTradesByNetworkIdStream(userNetworkId, opts)
// 		.then((data) => {
// 			const parser = getCsvParser();

// 			parser.on('error', (error) => {
// 				parser.destroy();
// 				throw error;
// 			});

// 			parser.on('end', () => {
// 				parser.destroy();
// 			});

// 			return data.pipe(parser);
// 		});
// };

const getAllUserTradesByNetworkId = (networkId, symbol, limit, page, orderBy, order, startDate, endDate, format, opts = {
	additionalHeaders: null
}) => {
	if (!networkId) {
		return reject(new Error(USER_NOT_REGISTERED_ON_NETWORK));
	}

	const params = {
		symbol,
		limit,
		page,
		orderBy,
		order,
		startDate,
		endDate,
		...opts
	};

	if (format) {
		params.format = 'all';
	}

	return getNodeLib().getUserTrades(networkId, opts)
		.then((trades) => {
			if (format === 'csv') {
				if (trades.data.length === 0) {
					throw new Error(NO_DATA_FOR_CSV);
				}
				const csv = parse(trades.data, Object.keys(trades.data[0]));
				return csv;
			} else {
				return trades;
			}
		});
};

const getGeneratedFees = (startDate, endDate, opts = {
	additionalHeaders: null
}) => {
	return getNodeLib().getGeneratedFees({
		startDate,
		endDate,
		...opts
	});
};

const settleFees = async (opts = {
	additionalHeaders: null
}) => {
	let network_id = null;
	if (opts.user_id) {
		// check mapKitIdToNetworkId
		const idDictionary = await mapKitIdToNetworkId([opts.user_id]);
		if (!has(idDictionary, opts.user_id)) {
			throw new Error(USER_NOT_FOUND);
		} else if (!idDictionary[opts.user_id]) {
			throw new Error(USER_NOT_REGISTERED_ON_NETWORK);
		} else {
			network_id = idDictionary[opts.user_id];
		}
	}

	return getNodeLib().settleFees({
		additionalHeaders: opts.additionalHeaders,
		user_id: network_id
	});
};

const generateOrderFeeData = (userTier, symbol, opts = { discount: 0 }) => {
	loggerOrders.debug(
		'generateOrderFeeData',
		'symbol',
		symbol,
		'userTier',
		userTier
	);

	const tier = getKitTier(userTier);

	if (!tier) {
		throw new Error(`User tier ${userTier} not found`);
	}

	let makerFee = tier.fees.maker[symbol];
	let takerFee = tier.fees.taker[symbol];

	loggerOrders.debug(
		'generateOrderFeeData',
		'current makerFee',
		makerFee,
		'current takerFee',
		takerFee
	);

	if (opts.discount) {
		loggerOrders.debug(
			'generateOrderFeeData',
			'discount percentage',
			opts.discount
		);

		const discountToBigNum = math.divide(
			math.bignumber(opts.discount),
			math.bignumber(100)
		);

		const discountedMakerFee = math.number(
			math.subtract(
				math.bignumber(makerFee),
				math.multiply(
					math.bignumber(makerFee),
					discountToBigNum
				)
			)
		);

		const discountedTakerFee = math.number(
			math.subtract(
				math.bignumber(takerFee),
				math.multiply(
					math.bignumber(takerFee),
					discountToBigNum
				)
			)
		);

		const exchangeMinFee = getDefaultFees();

		loggerOrders.verbose(
			'generateOrderFeeData',
			'discounted makerFee',
			discountedMakerFee,
			'discounted takerFee',
			discountedTakerFee,
			'exchange minimum fees',
			exchangeMinFee
		);

		if (discountedMakerFee > exchangeMinFee.maker) {
			makerFee = discountedMakerFee;
		} else {
			makerFee = exchangeMinFee.maker;
		}

		if (discountedTakerFee > exchangeMinFee.taker) {
			takerFee = discountedTakerFee;
		} else {
			takerFee = exchangeMinFee.taker;
		}
	}

	const feeData = {
		fee_structure: {
			maker: makerFee,
			taker: takerFee
		}
	};

	loggerOrders.verbose(
		'generateOrderFeeData',
		'generated fee data',
		feeData
	);

	return feeData;
};

module.exports = {
	getAllExchangeOrders,
	createUserOrderByKitId,
	getUserQuickTrade,
	createUserOrderByEmail,
	getUserOrderByKitId,
	getUserOrderByEmail,
	cancelUserOrderByKitId,
	cancelUserOrderByEmail,
	getAllUserOrdersByKitId,
	getAllUserOrdersByEmail,
	cancelAllUserOrdersByKitId,
	cancelAllUserOrdersByEmail,
	getAllTradesNetwork,
	getAllUserTradesByKitId,
	getAllUserTradesByNetworkId,
	getUserOrderByNetworkId,
	createUserOrderByNetworkId,
	createOrderNetwork,
	cancelUserOrderByNetworkId,
	getAllUserOrdersByNetworkId,
	cancelAllUserOrdersByNetworkId,
	getGeneratedFees,
	settleFees,
	generateOrderFeeData,
	dustUserBalance,
	executeUserOrder,
	dustPriceEstimate,
	updateQuickTradeConfig
	// getUserTradesByKitIdStream,
	// getUserTradesByNetworkIdStream,
	// getAllTradesNetworkStream,
	// getAllTradesNetworkCsv,
	// getUserTradesByKitIdCsv,
	// getUserTradesByNetworkIdCsv
};
