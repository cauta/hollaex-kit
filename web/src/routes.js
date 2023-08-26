import React, { Fragment } from 'react';
import { Router, Route, browserHistory } from 'react-router';
import ReactGA from 'react-ga';
import { isMobile } from 'react-device-detect';

import {
	App as Container,
	Account,
	MainWallet,
	CurrencyWallet,
	Login,
	Signup,
	VerificationEmailRequest,
	VerificationEmailCode,
	Home,
	Deposit,
	Withdraw,
	TransactionsHistory,
	Trade,
	ChartEmbed,
	Legal,
	AuthContainer,
	RequestResetPassword,
	ResetPassword,
	QuickTrade,
	Chat,
	WithdrawConfirmation,
	AddTradeTabs,
	Stake,
	StakeDetails,
	Apps,
	AppDetails,
	// ADMIN
	User,
	Session,
	AppWrapper as AdminContainer,
	// Main,
	// DepositsPage,
	Limits,
	// Wallets,
	UserFees,
	PATHS,
	AdminOrders,
	MobileHome,
	Broker,
	Plugins,
	PluginStore,
	// PluginServices,
	Settings,
	// Transfer,
	AdminFees,
	Init,
	AdminLogin,
	AdminDashboard,
	AdminFinancials,
	MoveToDash,
	General,
	Tiers,
	Roles,
	Resources,
	Pairs,
	Fiatmarkets,
	AdminApps,
	DigitalAssets,
	CoinPage,
	WhiteLabel,
	FeesAndLimits,
} from './containers';
import chat from './containers/Admin/Chat';
import { Billing } from 'containers/Admin';

import store from './store';
import { verifyToken } from './actions/authAction';
import { setLanguage } from './actions/appActions';
import { SmartTarget, NotLoggedIn } from 'components';

import {
	isLoggedIn,
	getToken,
	removeToken,
	getTokenTimestamp,
	isAdmin,
	checkRole,
} from './utils/token';
import {
	getLanguage,
	getInterfaceLanguage,
	getLanguageFromLocal,
} from './utils/string';
import { checkUserSessionExpired } from './utils/utils';
import { getExchangeInitialized, getSetupCompleted } from './utils/initialize';
import PluginConfig from 'containers/Admin/PluginConfig';
import ConfirmChangePassword from 'containers/ConfirmChangePassword';
import { STAKING_INDEX_COIN, isStakingAvailable } from 'config/contracts';

ReactGA.initialize('UA-154626247-1'); // Google analytics. Set your own Google Analytics values
browserHistory.listen((location) => {
	if (window) {
		window.scroll({
			top: 0,
			left: 0,
			behavior: 'smooth',
		});
	}
	ReactGA.set({ page: window.location.pathname });
	ReactGA.pageview(window.location.pathname);
});

let lang = getLanguage();
if (!lang) {
	lang = getInterfaceLanguage();
}

if (getLanguageFromLocal()) {
	store.dispatch(setLanguage(lang));
}

let token = getToken();

if (token) {
	// check if the token has expired, in that case, remove token
	if (checkUserSessionExpired(getTokenTimestamp())) {
		removeToken();
	} else {
		store.dispatch(verifyToken(token));
	}
}

function requireAuth(nextState, replace) {
	const initialized = getExchangeInitialized();
	const setup_completed = getSetupCompleted();
	if (
		initialized === 'false' ||
		(typeof initialized === 'boolean' && !initialized)
	) {
		replace({
			pathname: '/init',
		});
	} else if (
		!isLoggedIn() &&
		(setup_completed === 'false' ||
			(typeof setup_completed === 'boolean' && !setup_completed))
	) {
		replace({
			pathname: '/admin-login',
		});
	} else if (
		isLoggedIn() &&
		isAdmin() &&
		(setup_completed === 'false' ||
			(typeof setup_completed === 'boolean' && !setup_completed))
	) {
		replace({
			pathname: '/admin',
		});
	} else if (!isLoggedIn()) {
		replace({
			pathname: '/login',
		});
	}
}

function loggedIn(nextState, replace) {
	const initialized = getExchangeInitialized();
	const setup_completed = getSetupCompleted();
	if (
		initialized === 'false' ||
		(typeof initialized === 'boolean' && !initialized)
	) {
		replace({
			pathname: '/init',
		});
	} else if (
		!isLoggedIn() &&
		(setup_completed === 'false' ||
			(typeof setup_completed === 'boolean' && !setup_completed))
	) {
		replace({
			pathname: '/admin-login',
		});
	} else if (
		isLoggedIn() &&
		isAdmin() &&
		(setup_completed === 'false' ||
			(typeof setup_completed === 'boolean' && !setup_completed))
	) {
		replace({
			pathname: '/admin',
		});
	} else if (isLoggedIn()) {
		replace({
			pathname: '/account',
		});
	}
}

const checkStaking = (nextState, replace) => {
	const {
		app: { contracts },
	} = store.getState();
	if (!isStakingAvailable(STAKING_INDEX_COIN, contracts)) {
		replace({
			pathname: '/account',
		});
	}
};

const checkLanding = (nextState, replace) => {
	if (!store.getState().app.home_page) {
		replace({
			pathname: '/login',
		});
	}
};

const logOutUser = () => {
	if (getToken()) {
		removeToken();
	}
};

const setLogout = (nextState, replace) => {
	removeToken();
	replace({
		pathname: '/login',
	});
};

const createLocalizedRoutes = ({ router, routeParams }) => {
	store.dispatch(setLanguage(routeParams.locale));
	router.replace('/');
	return <div />;
};

const NotFound = ({ router }) => {
	router.replace('/account');
	return <div />;
};

const noAuthRoutesCommonProps = {
	onEnter: loggedIn,
};

const noLoggedUserCommonProps = {
	onEnter: logOutUser,
};

function withAdminProps(Component, key) {
	let adminProps = {};
	let restrictedPaths = [
		'general',
		'financials',
		'trade',
		'plugins',
		'tiers',
		'roles',
		'billing',
		'fiat',
	];

	PATHS.map((data) => {
		const { pathProps = {}, routeKey, ...rest } = data;
		if (routeKey === key) {
			adminProps = { ...rest, ...pathProps };
		}
		return 0;
	});
	return function (matchProps) {
		if (
			checkRole() !== 'admin' &&
			restrictedPaths.includes(key) &&
			!(checkRole() === 'supervisor' && key === 'financials')
		) {
			return <NotFound {...matchProps} />;
		} else {
			return <Component {...adminProps} {...matchProps} />;
		}
	};
}

function generateRemoteRoutes(remoteRoutes) {
	const privateRouteProps = { onEnter: requireAuth };

	return (
		<Fragment>
			{remoteRoutes.map(
				({ path, name, target, is_public, token_required }, index) => (
					<Route
						key={`${name}_remote-route_${index}`}
						path={path}
						name={name}
						component={() => {
							const Wrapper = token_required ? NotLoggedIn : Fragment;
							const props = token_required
								? {
										wrapperClassName:
											'pt-4 presentation_container apply_rtl settings_container',
								  }
								: {};
							return (
								<div>
									<Wrapper {...props}>
										<SmartTarget id={target} />
									</Wrapper>
								</div>
							);
						}}
						{...(!is_public && privateRouteProps)}
					/>
				)
			)}
		</Fragment>
	);
}

export const generateRoutes = (routes = []) => {
	const remoteRoutes = generateRemoteRoutes(routes);
	return (
		<Router history={browserHistory}>
			<Route path="lang/:locale" component={createLocalizedRoutes} />
			<Route component={AuthContainer} {...noAuthRoutesCommonProps}>
				<Route path="login" name="Login" component={Login} />
				<Route path="signup" name="signup" component={Signup} />
			</Route>
			<Route component={AuthContainer} {...noLoggedUserCommonProps}>
				<Route
					path="reset-password"
					name="Reset Password Request"
					component={RequestResetPassword}
				/>
				<Route
					path="reset-password/:code"
					name="Reset Password"
					component={ResetPassword}
				/>
				<Route
					path="verify"
					name="Verify"
					component={VerificationEmailRequest}
				/>
				<Route
					path="verify/:code"
					name="verifyCode"
					component={VerificationEmailCode}
				/>
			</Route>
			<Route component={Container}>
				<Route path="/" name="Home" component={Home} onEnter={checkLanding} />
				<Route
					path="/chart-embed/:pair"
					name="ChartEmbed"
					component={ChartEmbed}
				/>
				{isMobile ? (
					<Route
						path="/home"
						name="Home"
						component={MobileHome}
						onEnter={requireAuth}
					/>
				) : null}
				<Route
					path="change-password-confirm/:code"
					name="Reset Password Request"
					component={ConfirmChangePassword}
				/>
				<Route path="account" name="Account" component={Account} />
				<Route
					path="account/settings/username"
					name="username"
					component={Account}
				/>
				<Route path="security" name="Security" component={Account} />
				<Route
					path="developers"
					name="Developers"
					component={Account}
					onEnter={requireAuth}
				/>
				<Route path="settings" name="Settings" component={Account} />
				<Route path="apps" name="Apps" component={Apps} />
				<Route
					path="apps/details/:app"
					name="AppDetails"
					component={AppDetails}
					onEnter={requireAuth}
				/>
				<Route path="summary" name="Summary" component={Account} />
				<Route
					path="fees-and-limits"
					name="Fees and limits"
					component={FeesAndLimits}
				/>
				<Route path="assets" name="Digital Asset" component={DigitalAssets} />
				<Route path="white-label" name="WhiteLabel" component={WhiteLabel} />
				<Route path="verification" name="Verification" component={Account} />
				<Route path="wallet" name="Wallet" component={MainWallet} />
				<Route
					path="wallet/:currency"
					name="Wallet"
					component={CurrencyWallet}
					onEnter={requireAuth}
				/>
				<Route
					path="wallet/:currency/deposit"
					name="Deposit"
					component={Deposit}
					onEnter={requireAuth}
				/>
				<Route
					path="wallet/:currency/withdraw"
					name="Withdraw"
					component={Withdraw}
					onEnter={requireAuth}
				/>
				<Route
					path="transactions"
					name="Transactions"
					component={TransactionsHistory}
				/>
				<Route path="trade/:pair" name="Trade" component={Trade} />
				<Route path="markets" name="Trade Tabs" component={AddTradeTabs} />
				<Route
					path="quick-trade/:pair"
					name="Quick Trade"
					component={QuickTrade}
				/>
				<Route
					path="assets/coin/:token"
					name="Coin Page"
					component={CoinPage}
				/>
				<Route path="chat" name="Chat" component={Chat} onEnter={requireAuth} />
				<Route
					path="confirm-withdraw/:token"
					name="ConfirmWithdraw"
					component={WithdrawConfirmation}
				/>
				<Route
					path="stake"
					name="Stake"
					component={Stake}
					onEnter={checkStaking}
				/>
				<Route
					path="stake/details/:token"
					name="StakeToken"
					component={StakeDetails}
					onEnter={checkStaking}
				/>
				<Route path="logout" name="LogOut" onEnter={setLogout} />
				{remoteRoutes}
			</Route>
			<Route component={AdminContainer}>
				<Route path="/admin" name="Admin Main" component={AdminDashboard} />
				<Route
					path="/admin/general"
					name="Admin General"
					component={withAdminProps(General, 'general')}
				/>
				<Route
					path="/admin/fiat"
					name="Admin Fiat"
					component={withAdminProps(Fiatmarkets, 'fiat')}
				/>
				<Route
					path="/admin/tiers"
					name="Admin Tiers"
					component={withAdminProps(Tiers, 'tiers')}
				/>
				<Route
					path="/admin/roles"
					name="Admin Roles"
					component={withAdminProps(Roles, 'roles')}
				/>
				<Route
					path="/admin/user"
					name="Admin User"
					component={withAdminProps(User, 'user')}
				/>
				<Route
					path="/admin/sessions"
					name="Admin Session"
					component={withAdminProps(Session, 'session')}
				/>
				<Route
					path="/admin/financials"
					name="Admin Financials"
					component={withAdminProps(AdminFinancials, 'financials')}
				/>
				<Route
					path="/admin/trade"
					name="Admin Trade"
					component={withAdminProps(Pairs, 'trade')}
				/>
				<Route
					path="/admin/hosting"
					name="Admin Hosting"
					component={withAdminProps(MoveToDash, 'hosting')}
				/>
				<Route
					path="/admin/apikeys"
					name="Admin APIkeys"
					component={withAdminProps(MoveToDash, 'apikeys')}
				/>
				<Route
					path="/admin/billing"
					name="Admin Billing"
					component={withAdminProps(Billing, 'billing')}
				/>
				<Route
					path="/admin/chat"
					name="Admin Chat"
					component={withAdminProps(chat, 'chat')}
				/>
				<Route
					path="/admin/collateral"
					name="Admin Collateral"
					component={withAdminProps(MoveToDash, 'collateral')}
				/>
				<Route
					path="/admin/plugin/adminView/:name"
					name="Admin Announcement"
					component={withAdminProps(PluginConfig, 'adminView')}
				/>
				{/* <Route
				path="/admin/wallets"
				name="Admin Wallets"
				component={withAdminProps(Wallets, 'wallets')}
			/> */}
				{/* <Route
				path="/admin/transfer"
				name="Admin Transfer"
				component={withAdminProps(Transfer, 'transfer')}
			/> */}
				<Route
					path="/admin/fees"
					name="Admin Fees"
					component={withAdminProps(AdminFees, 'fees')}
				/>
				{/* <Route
				path="/admin/withdrawals"
				name="Admin Withdrawals"
				component={withAdminProps(DepositsPage, 'withdrawal')}
			/>
			<Route
				path="/admin/deposits"
				name="Admin Deposits"
				component={withAdminProps(DepositsPage, 'deposit')}
			/> */}
				<Route
					path="/admin/pair"
					name="Admin Pairs"
					component={withAdminProps(UserFees, 'pair')}
				/>
				<Route
					path="/admin/coin"
					name="Admin Coins"
					component={withAdminProps(Limits, 'coin')}
				/>
				<Route
					path="/admin/activeorders"
					name="Admin Orders"
					component={withAdminProps(AdminOrders, 'orders')}
				/>
				<Route
					path="/admin/broker"
					name="Admin broker"
					component={withAdminProps(Broker, 'broker')}
				/>
				<Route
					path="/admin/plugins"
					name="Admin plugins"
					component={withAdminProps(Plugins, 'plugins')}
				/>
				<Route
					path="/admin/plugins/store"
					name="Admin plugins store"
					component={withAdminProps(PluginStore, 'plugins')}
				/>
				<Route
					path="/admin/apps"
					name="Admin apps"
					component={withAdminProps(AdminApps, 'apps')}
				/>
				{/* <Route
				path="/admin/plugins/:services"
				name="Admin plugins"
				component={withAdminProps(PluginServices, 'plugins')}
			/> */}
				<Route
					path="/admin/settings"
					name="Admin settings"
					component={withAdminProps(Settings, 'settings')}
				/>
				<Route
					path="/admin/resources"
					name="Admin resources"
					component={withAdminProps(Resources, 'resources')}
				/>
			</Route>
			<Route
				path="privacy-policy"
				component={Legal}
				content="legal"
				onEnter={requireAuth}
			/>
			<Route
				path="general-terms"
				component={Legal}
				content="terms"
				onEnter={requireAuth}
			/>
			<Route path="admin-login" name="admin-login" component={AdminLogin} />
			<Route path="init" name="initWizard" component={Init} />
			<Route path="*" component={NotFound} />
		</Router>
	);
};
