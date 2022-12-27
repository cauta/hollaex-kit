import React, { Component } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import classnames from 'classnames';
import { isMobile } from 'react-device-detect';
import { IconTitle, Accordion, MobileBarTabs } from 'components';
import { TransactionsHistory, Stake } from 'containers';
import { changeSymbol } from 'actions/orderbookAction';
import {
	BASE_CURRENCY,
	CURRENCY_PRICE_FORMAT,
	DEFAULT_COIN_DATA,
} from 'config/constants';
import { formatCurrencyByIncrementalUnit } from 'utils/currency';
import STRINGS from 'config/localizedStrings';
import withConfig from 'components/ConfigProvider/withConfig';

import AssetsBlock from './AssetsBlock';
import MobileWallet from './MobileWallet';
import DustSection from './DustSection';
import { STATIC_ICONS } from 'config/icons';
import { isStakingAvailable, STAKING_INDEX_COIN } from 'config/contracts';

class Wallet extends Component {
	constructor(props) {
		super(props);
		this.state = {
			activeTab: 0,
			sections: [],
			mobileTabs: [],
			isOpen: true,
			isZeroBalanceHidden:
				localStorage.getItem('isZeroBalanceHidden') === 'true' ? true : false,
			showDustSection: false,
		};
	}

	componentDidMount() {
		this.generateSections(
			this.props.changeSymbol,
			this.props.balance,
			this.props.prices,
			this.state.isOpen,
			this.props.bankaccount,
			this.props.coins,
			this.props.pairs,
			this.props.totalAsset,
			this.props.oraclePrices,
			this.props.constants,
			this.props.contracts,
			this.props.isFetching
		);
	}

	UNSAFE_componentWillReceiveProps(nextProps) {
		this.generateSections(
			nextProps.changeSymbol,
			nextProps.balance,
			nextProps.prices,
			this.state.isOpen,
			nextProps.bankaccount,
			nextProps.coins,
			nextProps.pairs,
			nextProps.totalAsset,
			nextProps.oraclePrices,
			nextProps.constants,
			nextProps.contracts,
			nextProps.isFetching
		);
	}

	componentDidUpdate(_, prevState) {
		const { searchValue, isZeroBalanceHidden, showDustSection } = this.state;
		if (
			searchValue !== prevState.searchValue ||
			isZeroBalanceHidden !== prevState.isZeroBalanceHidden ||
			showDustSection !== prevState.showDustSection
		) {
			this.generateSections(
				this.props.changeSymbol,
				this.props.balance,
				this.props.prices,
				this.state.isOpen,
				this.props.bankaccount,
				this.props.coins,
				this.props.pairs,
				this.props.totalAsset,
				this.props.oraclePrices,
				this.props.constants,
				this.props.contracts,
				this.props.isFetching
			);
		}
	}

	getSearchResult = (coins, balance, oraclePrices) => {
		const { searchValue = '', isZeroBalanceHidden } = this.state;

		const result = {};
		const searchTerm = searchValue.toLowerCase().trim();
		Object.keys(coins).map((key) => {
			const temp = coins[key];
			const { fullname } = coins[key] || DEFAULT_COIN_DATA;
			const coinName = fullname ? fullname.toLowerCase() : '';
			const hasCoinBalance = !!balance[`${key}_balance`];
			const isCoinHidden = isZeroBalanceHidden && !hasCoinBalance;
			if (
				!isCoinHidden &&
				(key.indexOf(searchTerm) !== -1 || coinName.indexOf(searchTerm) !== -1)
			) {
				result[key] = { ...temp, oraclePrice: oraclePrices[key] };
			}
			return key;
		});
		return { ...result };
	};

	getMobileSlider = (coins, oraclePrices) => {
		const result = {};
		Object.keys(coins).map((key) => {
			const temp = coins[key];
			return (result[key] = { ...temp, oraclePrice: oraclePrices[key] });
		});
		return { ...result };
	};

	handleSearch = (_, value) => {
		this.setState({ searchValue: value });
	};

	handleCheck = (_, value) => {
		this.setState({ isZeroBalanceHidden: value });
		localStorage.setItem('isZeroBalanceHidden', value);
	};

	generateSections = (
		changeSymbol,
		balance,
		prices,
		isOpen = false,
		bankaccount,
		coins,
		pairs,
		total,
		oraclePrices,
		{ features: { stake_page = false } = {} } = {},
		contracts = {},
		isFetching
	) => {
		const { showDustSection } = this.state;
		const { increment_unit, display_name } =
			coins[BASE_CURRENCY] || DEFAULT_COIN_DATA;
		const totalAssets = STRINGS.formatString(
			CURRENCY_PRICE_FORMAT,
			display_name,
			formatCurrencyByIncrementalUnit(total, increment_unit)
		);
		const searchResult = this.getSearchResult(coins, balance, oraclePrices);

		const sections = [
			{
				stringId: 'WALLET_ALL_ASSETS',
				title: STRINGS['WALLET_ALL_ASSETS'],
				content: (
					<AssetsBlock
						balance={balance}
						prices={prices}
						coins={coins}
						pairs={pairs}
						totalAssets={totalAssets}
						changeSymbol={changeSymbol}
						onOpenDialog={this.onOpenDialog}
						bankaccount={bankaccount}
						navigate={this.goToPage}
						searchResult={searchResult}
						handleSearch={this.handleSearch}
						handleCheck={this.handleCheck}
						hasEarn={
							isStakingAvailable(STAKING_INDEX_COIN, contracts) &&
							stake_page &&
							!isMobile
						}
						loading={isFetching}
						contracts={contracts}
						broker={this.props.broker}
						goToDustSection={this.goToDustSection}
						showDustSection={showDustSection}
						goToWallet={this.goToWallet}
					/>
				),
				isOpen: true,
				allowClose: false,
				notification: !isMobile && {
					stringId: 'TRADE_HISTORY',
					text: STRINGS['TRADE_HISTORY'],
					status: 'information',
					iconId: 'PAPER_CLIP',
					iconPath: STATIC_ICONS['CLOCK'],
					allowClick: true,
					className: isOpen
						? 'paper-clip-icon'
						: 'paper-clip-icon wallet-notification',
					onClick: () => {
						this.props.router.push('/transactions');
					},
				},
			},
		];
		const mobileTabs = [
			{
				title: STRINGS['WALLET_TAB_WALLET'],
				content: (
					<MobileWallet
						sections={sections}
						balance={balance}
						prices={prices}
						navigate={this.goToPage}
						coins={coins}
						searchResult={this.getMobileSlider(coins, oraclePrices)}
					/>
				),
			},
			{
				title: STRINGS['WALLET_TAB_TRANSACTIONS'],
				content: <TransactionsHistory />,
			},
			{
				title: STRINGS['ACCOUNTS.TAB_STAKE'],
				content: <Stake />,
			},
		];
		this.setState({ sections, isOpen, mobileTabs });
	};

	goToPage = (path = '') => {
		this.props.router.push(path);
	};

	setActiveTab = (activeTab) => {
		this.setState({ activeTab });
	};

	goToDustSection = () => {
		this.setState({ showDustSection: true });
	};

	goToWallet = () => {
		this.setState({ showDustSection: false });
	};

	render() {
		const { sections, activeTab, mobileTabs, showDustSection } = this.state;
		const { icons: ICONS } = this.props;

		if (mobileTabs.length === 0) {
			return <div />;
		}
		return (
			<div className="apply_rtl">
				{isMobile ? (
					<div>
						<MobileBarTabs
							tabs={mobileTabs}
							activeTab={activeTab}
							setActiveTab={this.setActiveTab}
						/>
						<div className="content-with-bar d-flex">
							{mobileTabs[activeTab].content}
						</div>
					</div>
				) : (
					<div
						className={classnames(
							'presentation_container',
							'apply_rtl',
							'wallet-wrapper',
							{ settings_container: showDustSection }
						)}
					>
						<IconTitle
							stringId="WALLET_TITLE"
							text={STRINGS['WALLET_TITLE']}
							iconPath={ICONS['TAB_WALLET']}
							iconId="TAB_WALLET"
							textType="title"
						/>
						<div
							className={classnames('wallet-container', {
								'no-border': showDustSection,
							})}
						>
							{showDustSection ? (
								<DustSection goToWallet={this.goToWallet} />
							) : (
								<Accordion sections={sections} />
							)}
						</div>
					</div>
				)}
			</div>
		);
	}
}

const mapStateToProps = (store) => ({
	coins: store.app.coins,
	constants: store.app.constants,
	pairs: store.app.pairs,
	prices: store.orderbook.prices,
	balance: store.user.balance,
	activeTheme: store.app.theme,
	activeLanguage: store.app.language,
	bankaccount: store.user.userData.bank_account,
	totalAsset: store.asset.totalAsset,
	oraclePrices: store.asset.oraclePrices,
	isFetching: store.asset.isFetching,
	contracts: store.app.contracts,
	broker: store.app.broker,
});

const mapDispatchToProps = (dispatch) => ({
	changeSymbol: bindActionCreators(changeSymbol, dispatch),
});

export default connect(mapStateToProps, mapDispatchToProps)(withConfig(Wallet));
