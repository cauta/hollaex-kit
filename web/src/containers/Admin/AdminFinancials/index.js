import React, { useEffect, useState } from 'react';
import { Tabs } from 'antd';

import Earnings from './Earnings';
import Duster from './Duster';
import Wallets from '../Wallets';
import DepositPage from '../DepositsPage';
import Transfer from '../Transfers';
import ExchangeOrdersContainer from '../Orders';

import Assets, { getTabParams } from './Assets';
import './index.css';
import Wallet from './Wallet';
import Balances from './Balances';

const TabPane = Tabs.TabPane;

const AdminFinancials = ({ router, location, user }) => {
	const [activeTab, setActiveTab] = useState('0');
	const [hideTabs, setHideTabs] = useState(false);

	const tabParams = getTabParams();
	useEffect(() => {
		if (tabParams) {
			setActiveTab(tabParams.tab);
		}
	}, [tabParams]);

	const handleTabChange = (key) => {
		setActiveTab(key);
		router.replace('/admin/financials');
	};

	const handleHide = (isHide) => {
		setHideTabs(isHide);
	};

	const renderTabBar = (props, DefaultTabBar) => {
		if (hideTabs) return <div></div>;
		return <DefaultTabBar {...props} />;
	};

	return (
		<div className="app_container-content admin-earnings-container w-100">
			<Tabs
				defaultActiveKey="0"
				activeKey={activeTab}
				onChange={handleTabChange}
				renderTabBar={renderTabBar}
			>
				<TabPane tab="Assets" key="0">
					<Assets location={location} handleHide={handleHide} />
				</TabPane>
				<TabPane tab="Summary" key="1">
					<Wallets router={router} />
				</TabPane>
				<TabPane tab="Wallet" key="2">
					<Wallet />
				</TabPane>
				<TabPane tab="Balances" key="3">
					<Balances />
				</TabPane>
				<TabPane tab="Orders" key="4">
					<ExchangeOrdersContainer
						type="orders"
						user={user}
						showFilters={true}
					/>
				</TabPane>
				<TabPane tab="Deposits" key="5">
					<DepositPage type="deposit" showFilters={true} />
				</TabPane>
				<TabPane tab="Withdrawals" key="6">
					<DepositPage type="withdrawal" showFilters={true} />
				</TabPane>
				<TabPane tab="Earnings" key="7">
					<Earnings />
				</TabPane>
				<TabPane tab="Transfers" key="8">
					<Transfer />
				</TabPane>
				<TabPane tab="Duster" key="9">
					<Duster />
				</TabPane>
			</Tabs>
		</div>
	);
};

export default AdminFinancials;
