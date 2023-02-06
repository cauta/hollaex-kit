import React, { useState, useEffect, useCallback } from 'react';
import { Button, Modal, Divider, Spin, message } from 'antd';
import { StarFilled, ClockCircleOutlined } from '@ant-design/icons';
import { connect } from 'react-redux';
import { Carousel, BlueLink } from 'components';
import STRINGS from 'config/localizedStrings';
import { STATIC_ICONS } from 'config/icons';
import {
	addPlugin,
	updatePlugins,
	getPluginActivateDetails,
	getPluginStoreDetails,
} from './action';
import ConfirmPlugin from './ConfirmPlugin';

const PluginDetails = ({
	handleBreadcrumb,
	selectedNetworkPlugin = {},
	selectedPlugin = {},
	handlePluginList,
	updatePluginList,
	removePlugin,
	pluginData,
	isLoading,
	restart,
	handleRedirect,
	exchange,
}) => {
	const [isOpen, setOpen] = useState(false);
	const [type, setType] = useState('');
	const [isConfirm, setConfirm] = useState(true);
	// const [isLoading, setLoading] = useState(false);
	const [isAddLoading, setAddLoading] = useState(false);
	const [isVersionUpdate, setUpdate] = useState(false);
	const [isUpdateLoading, setUpdateLoading] = useState(false);
	const [pluginStoreDetails, setPluginStoreDetails] = useState({});
	console.log('PluginDetails', selectedPlugin);
	console.log('PluginDetails: exchange', exchange);
	console.log('PluginDetails: pluginStoreDetails', pluginStoreDetails);

	const requestPlugin = useCallback(() => {
		getPluginStoreDetails({ name: selectedPlugin.name })
			.then((res) => {
				console.log('getPluginStoreDetails res', res);
				// setLoading(false);
				setPluginStoreDetails(res);
			})
			.catch((err) => {
				if (!selectedPlugin.enabled) {
					setPluginStoreDetails({});
				}
				// setLoading(false);
			});
	}, [selectedPlugin]);

	useEffect(() => {
		requestPlugin();
	}, [requestPlugin]);

	const onHandlePluginActivate = async () => {
		getPluginActivateDetails({ name: selectedPlugin.name })
			.then((res) => {
				console.log('getPluginActivateDetails res', res);
				// setLoading(false);
				setPluginStoreDetails(res);
			})
			.catch((err) => {
				if (!selectedPlugin.enabled) {
					setPluginStoreDetails({});
				}
				// setLoading(false);
			});
	};
	const handleAddPlugin = async () => {
		const body = {
			...pluginData,
			enabled: true,
		};
		setAddLoading(true);
		addPlugin(body)
			.then((res) => {
				setAddLoading(false);
				handlePluginList(res);
				restart(() => message.success('Plugin installed successfully'));
				handleRedirect();
			})
			.catch((err) => {
				setAddLoading(false);
				const _error =
					err.data && err.data.message ? err.data.message : err.message;
				message.error(_error);
			});
	};

	const handleUpdatePlugin = () => {
		handleClose();
		const body = {
			...selectedNetworkPlugin,
		};
		setUpdateLoading(true);
		updatePlugins({ name: pluginData.name }, body)
			.then((res) => {
				setUpdateLoading(false);
				updatePluginList(pluginData);
				restart(() => message.success('Plugin updated successfully'));
			})
			.catch((err) => {
				setUpdateLoading(false);
				const _error =
					err.data && err.data.message ? err.data.message : err.message;
				message.error(_error);
			});
	};

	const handleClose = () => {
		setOpen(false);
		setType('');
		setUpdate(false);
	};

	const handleAdd = () => {
		handleClose();
		handleAddPlugin();
	};

	const handleType = (type) => {
		setOpen(true);
		setType(type);
	};

	const handleRemove = (type) => {
		setType(type);
		removePlugin({ name: pluginData.name });
		handleClose();
		restart(() => message.success('Removed plugin successfully'));
	};

	const handleChange = (e) => {
		if (e.target.value === 'I UNDERSTAND') {
			setConfirm(false);
		} else {
			setConfirm(true);
		}
	};

	const handleUpdate = () => {
		setOpen(true);
		setUpdate(true);
	};

	const renderPopup = () => {
		switch (type) {
			case 'remove':
				return (
					<div className="admin-plugin-modal-wrapper">
						<div className="remove-wrapper">
							<img
								src={STATIC_ICONS.PLUGIN_REMOVAL_WHITE}
								alt="Plugin"
								className="plugin-removal-icon"
							/>
							<h5>
								<b>Plugin removal</b>
							</h5>
							<div>
								Removing a plugin will discontinue any functionality it provides
								to your exchange. This may have unknown effects on your
								exchange.
							</div>
							<div className="my-4 btn-wrapper d-flex justify-content-between">
								<Button
									type="primary"
									className="add-btn"
									onClick={handleClose}
								>
									Back
								</Button>
								<Button
									type="primary"
									className="add-btn"
									onClick={() => handleType('confirm-plugin')}
								>
									I understand. Proceed.
								</Button>
							</div>
						</div>
					</div>
				);
			case 'confirm-plugin':
				return (
					<ConfirmPlugin
						header={'Confirm plugin removal'}
						description={`Please acknowledge that you understand the possible ramifications of removing this plugin from your exchange.`}
						pluginData={pluginData}
						isConfirm={isConfirm}
						isShowThumbnail={true}
						onHandleBack={() => handleType('remove')}
						okBtnlabel={'Remove'}
						onHandleChange={handleChange}
						onHandleSubmit={() => handleRemove('confirm-plugin')}
					/>
				);
			case 'add':
			default:
				return (
					<div className="admin-plugin-modal-wrapper">
						<h2>
							{isVersionUpdate ? <b>Update plugin</b> : <b>Add plugin</b>}
						</h2>
						<div className="d-flex mt-4">
							<img
								src={
									pluginData && pluginData.icon
										? pluginData.icon
										: STATIC_ICONS.DEFAULT_PLUGIN_THUMBNAIL
								}
								alt="Plugin"
								className="plugin-icon"
							/>
							<div className="mx-3">
								<div>
									<b>Name:</b> {pluginData.name}
								</div>
								<div className="my-2">
									<b>Description:</b> {pluginData.description}
								</div>
								<div className="my-2">
									<b>Author:</b> {pluginData.author}
								</div>
								{isVersionUpdate ? (
									<div>
										<div>
											<b>Currently installed versions:</b>{' '}
											{selectedPlugin.version}
										</div>
										<div className="my-2 d-flex">
											<b>Newest version:</b> {pluginData.version}
										</div>
									</div>
								) : (
									<div>
										<b>Version:</b> {pluginData.version}
									</div>
								)}
							</div>
						</div>
						<Divider />
						{isVersionUpdate ? (
							<div>Are you sure you want to update this plugin?</div>
						) : (
							<div>Are you sure you want to add this plugin?</div>
						)}
						<div className="my-4">
							{isVersionUpdate ? (
								<Button
									type="primary"
									className="add-btn"
									onClick={handleUpdatePlugin}
								>
									Update
								</Button>
							) : (
								<Button type="primary" className="add-btn" onClick={handleAdd}>
									Add
								</Button>
							)}
						</div>
					</div>
				);
		}
	};

	const handleOpenConfirmation = () => {
		setOpen(true);
		setUpdate(false);
	};

	const renderButtonContent = () => {
		// console.log(object);
		// const tempPluginData = {...pluginData, only_for:[], free_for:['boost', 'crypto','fiat']}
		const tempPluginData = { ...pluginData };

		if (isAddLoading || isUpdateLoading) {
			return (
				<div className="d-flex mt-5">
					<ClockCircleOutlined />
					<div>
						{isUpdateLoading
							? 'Update is in progress...'
							: 'Installation in progress...'}
					</div>
				</div>
			);
		} else if (selectedPlugin.enabled) {
			return (
				<div className="btn-wrapper mt-3">
					<div className="d-flex justify-content-between">
						<Button
							type="primary"
							className="remove-btn mr-2"
							onClick={() => handleType('remove')}
						>
							Remove
						</Button>
						<Button
							type="primary"
							className="config-btn"
							onClick={handleBreadcrumb}
						>
							Configure
						</Button>
					</div>
					{selectedPlugin.url && (
						<div className="text-align-center">
							<a
								href={selectedPlugin.url}
								target="_blank"
								rel="noopener noreferrer"
								className="underline-text"
							>
								Learn more
							</a>{' '}
							about this plugin
						</div>
					)}
					<div className="d-flex align-items-center justify-content-end">
						{selectedNetworkPlugin.version > selectedPlugin.version && (
							<div className="d-flex align-items-center flex-column">
								<Button
									type="primary"
									className="update-btn"
									onClick={handleUpdate}
								>
									Update
								</Button>
								<div className="d-flex">
									<div className="small-circle"></div>
									<div className="update-txt">{`v${selectedNetworkPlugin.version} available`}</div>
								</div>
							</div>
						)}
					</div>
				</div>
			);
		} else {
			// To-do : check Activation plugin list
			if (
				tempPluginData.payment_type === 'free' ||
				tempPluginData?.free_for?.includes(exchange.plan) ||
				tempPluginData?.only_for?.includes(exchange.plan)
			) {
				return (
					<div className="btn-wrapper">
						<Button
							type="primary"
							className="add-btn"
							onClick={handleOpenConfirmation}
						>
							Install
						</Button>
						<div className="small-txt">Free to install</div>
					</div>
				);
			} else if (
				tempPluginData.payment_type !== 'free' &&
				((!tempPluginData?.free_for?.length &&
					!tempPluginData?.only_for?.length) ||
					(!tempPluginData?.free_for?.includes(exchange.plan) &&
						!tempPluginData?.only_for?.length) ||
					tempPluginData.name.toLowerCase() === 'exclusive')
			) {
				return (
					<div className="btn-wrapper">
						<Button
							type="primary"
							className="add-btn"
							onClick={handleOpenConfirmation}
							disabled={!Object.keys(pluginData).length}
						>
							Buy
						</Button>
					</div>
				);
			} else if (
				tempPluginData.payment_type !== 'free' &&
				tempPluginData?.free_for?.includes(exchange.plan) &&
				tempPluginData?.only_for?.includes(exchange.plan) &&
				!tempPluginData?.free_for?.length &&
				tempPluginData?.only_for?.length
			) {
				return (
					<div className="btn-wrapper">
						<Button
							type="primary"
							className="add-btn"
							onClick={onHandlePluginActivate}
							disabled={!tempPluginData?.only_for?.includes(exchange.plan)}
						>
							Activate
						</Button>
						{!tempPluginData.only_for.includes(exchange.plan) ? (
							<div className="ml-2 font-weight-bold">
								{STRINGS['TERMS_OF_SERVICES.TO_GET_ACCESS']}
								<BlueLink
									href="mailto:sales@hollaex.com"
									text={'sales@hollaex.com'}
								/>
							</div>
						) : null}
					</div>
				);
			}
		}
	};

	const getCards = () => {
		const cardData = [
			{
				logo:
					pluginData && pluginData.logo
						? pluginData.logo
						: STATIC_ICONS.DEFAULT_PLUGIN_PREVIEW,
			},
		];
		return cardData.map((data) => (
			<div>
				<img src={data.logo} alt="PluginCard" className="plugin-card" />
				<div className="d-flex mt-2 ml-1">
					<StarFilled />
					<div>Featured plugin</div>
				</div>
			</div>
		));
	};

	if (isLoading) {
		return (
			<div className="app_container-content d-flex justify-content-center">
				<Spin size="large" />
			</div>
		);
	}

	return (
		<div>
			<div className="plugin-details-wrapper">
				<div className="main-content">
					<div className="d-flex justify-content-between">
						<div className="d-flex">
							<img
								src={
									pluginData && pluginData.icon
										? pluginData.icon
										: STATIC_ICONS.DEFAULT_PLUGIN_THUMBNAIL
								}
								alt="Plugin"
								className="plugin-icon"
							/>
							<div className="ml-3 inner-content">
								<div>
									<h3>{pluginData.name}</h3>
									<p>
										<b>Version:</b> {pluginData.version}
									</p>
								</div>
								<p>{pluginData.bio}</p>
								<div>
									<b>Author:</b> {pluginData.author}
								</div>
								{pluginData.free_for ? (
									<div>
										<b>Free for:</b> {pluginData.free_for.join()}
									</div>
								) : null}
								{pluginData.only_for ? (
									<div>
										<b>Only for:</b> {pluginData.only_for.join()}
									</div>
								) : null}
								<div>
									<b>Payment Type:</b> {pluginData.payment_type}
								</div>
								<div>
									<b>Price Tag:</b>{' '}
									<Button type="priceTag primary" size="small">
										{' '}
										Free{' '}
									</Button>
								</div>
								{renderButtonContent()}
							</div>
						</div>
						<div className="plugin-carousel-wrapper ml-3">
							<Carousel items={getCards()} />
						</div>
					</div>
				</div>
			</div>
			<div className="plugin-divider"></div>
			<div className="plugin-details-wrapper">
				<div>
					<div>
						<div className="about-label">About</div>
						<div className="about-contents">
							<b>OverView</b>
							<div className="my-3">{pluginData.description}</div>
							<div className="my-5">
								<h2>Main features</h2>
							</div>
						</div>
					</div>
				</div>
				<Modal
					visible={isOpen}
					width={450}
					onCancel={handleClose}
					footer={false}
				>
					{renderPopup()}
				</Modal>
			</div>
		</div>
	);
};

const mapStateToProps = (state) => {
	return {
		exchange: state.asset.exchange,
	};
};

export default connect(mapStateToProps, {})(PluginDetails);
