import React, { Component } from 'react';
import { Link } from 'react-router';
import { connect } from 'react-redux';
import { isMobile } from 'react-device-detect';
import classnames from 'classnames';

import {
	IconTitle,
	// CurrencyBallWithPrice,
	ButtonLink,
	ActionNotification,
	MobileBarBack,
	Coin,
	EditWrapper,
} from 'components';
import { FLEX_CENTER_CLASSES, DEFAULT_COIN_DATA } from 'config/constants';
import {
	formatToCurrency,
	generateWalletActionsText,
	getCurrencyFromName,
} from 'utils/currency';
import STRINGS from 'config/localizedStrings';
import withConfig from 'components/ConfigProvider/withConfig';
import { STATIC_ICONS } from 'config/icons';

class Wallet extends Component {
	state = {
		currency: '',
	};

	UNSAFE_componentWillMount() {
		this.setCurrency(this.props.routeParams.currency);
	}

	UNSAFE_componentWillReceiveProps(nextProps) {
		if (nextProps.routeParams.currency !== this.props.routeParams.currency) {
			this.setCurrency(nextProps.routeParams.currency);
		}
	}

	setCurrency = (currencyName) => {
		const currency = getCurrencyFromName(currencyName, this.props.coins);
		if (currency) {
			this.setState({ currency });
		} else {
			this.props.router.push('/wallet');
		}
	};

	renderWalletHeaderBlock = (symbol, price, balance, coins) => {
		const balanceValue = balance[`${symbol}_balance`] || 0;
		const { fullname, min, icon_id } = coins[symbol] || DEFAULT_COIN_DATA;
		return (
			<div className="wallet-header_block">
				<div className="wallet-header_block-currency_title">
					<EditWrapper stringId="CURRENCY_BALANCE_TEXT">
						{STRINGS.formatString(STRINGS['CURRENCY_BALANCE_TEXT'], fullname)}
					</EditWrapper>
					<ActionNotification
						stringId="TRADE_HISTORY"
						text={STRINGS['TRADE_HISTORY']}
						status="information"
						iconId="PAPER_CLIP"
						iconPath={STATIC_ICONS['PAPER_CLIP']}
						className="paper-clip-icon"
						onClick={() => {
							this.props.router.push('/transactions');
						}}
					/>
				</div>
				<div className="link-container mb-0 mt-3">
					<EditWrapper stringId="CURRENCY_WALLET.WALLET_PAGE">
						{STRINGS.formatString(
							STRINGS['CURRENCY_WALLET.WALLET_PAGE'],
							<Link className="link-content" to="wallet">
								{STRINGS['CURRENCY_WALLET.BACK']}
							</Link>
						)}
					</EditWrapper>
				</div>
				<div className="link-container mb-5">
					<EditWrapper stringId="CURRENCY_WALLET.ABOUT">
						{STRINGS.formatString(
							STRINGS['CURRENCY_WALLET.ABOUT'],
							<Link to={`/assets/coin/${symbol}`} className="link-content">
								{STRINGS['CURRENCY_WALLET.LEARN_MORE']}
							</Link>
						)}
					</EditWrapper>{' '}
					{symbol.toUpperCase()}
				</div>
				{/* <CurrencyBallWithPrice
					symbol={symbol}
					amount={balanceValue}
					price={price}
				/> */}
				<div className="d-flex">
					<Coin iconId={icon_id} type="CS11" />
					<div className="with_price-block_amount-value px-2">
						{`${formatToCurrency(balanceValue, min)}`}
					</div>
				</div>
			</div>
		);
	};

	onGoBack = () => {
		this.props.router.push('/wallet');
	};

	render() {
		const { balance, price, coins, icons: ICONS } = this.props;
		const { currency } = this.state;
		if (!currency) {
			return <div />;
		}

		const { depositText, withdrawText } = generateWalletActionsText(
			currency,
			coins
		);

		return (
			<div>
				{isMobile && (
					<MobileBarBack onBackClick={this.onGoBack}></MobileBarBack>
				)}
				<div className="presentation_container apply_rtl">
					<IconTitle
						stringId="WALLET_TITLE"
						text={STRINGS['WALLET_TITLE']}
						iconId="BITCOIN_WALLET"
						iconPath={ICONS['BITCOIN_WALLET']}
						textType="title"
					/>
					<div className="wallet-container">
						{this.renderWalletHeaderBlock(currency, price, balance, coins)}
						<div
							className={classnames(
								...FLEX_CENTER_CLASSES,
								'wallet-buttons_action'
							)}
						>
							{coins[currency].allow_deposit ? (
								<ButtonLink
									label={depositText}
									link={`/wallet/${currency}/deposit`}
								/>
							) : null}
							<div className="separator" />
							{coins[currency].allow_withdrawal ? (
								<ButtonLink
									label={withdrawText}
									link={`/wallet/${currency}/withdraw`}
								/>
							) : null}
						</div>
					</div>
				</div>
			</div>
		);
	}
}

const mapStateToProps = (store) => ({
	coins: store.app.coins,
	price: store.orderbook.price,
	balance: store.user.balance,
	activeLanguage: store.app.language,
});

export default connect(mapStateToProps)(withConfig(Wallet));
