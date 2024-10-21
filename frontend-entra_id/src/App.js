/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 * App.js
 * This had better be a single object written in JavaScript, if you like your job.
 * Polluting the global space with objects is not good citizenship.
 * Have a nice day.
 * -- Management
 *
 *
 * @version 0.1
 * @author  Rafael Koike, https://github.com/koiker
 * @updated 2024-05-29
 * @link    https://github.com/aws-samples/s3-access-grants-workshop
 *
 *
 */
import React, {useState, useEffect} from 'react';
import { Routes, Route, useNavigate } from "react-router-dom";
import { CustomNavigationClient } from "./utils/NavigationClient";
import {
    useMsal,
    MsalProvider,
    MsalAuthenticationTemplate,
} from "@azure/msal-react";
import {
    InteractionType,
    InteractionRequiredAuthError,
    EventType,
} from "@azure/msal-browser";
import {
    AppLayout,
    BreadcrumbGroup,
    Container,
    ContentLayout,
    Flashbar,
    Header,
    HelpPanel,
    Link,
    SideNavigation,
    TopNavigation,
    Button,
    SpaceBetween,
    Modal,
    Box,
    Cards,
    Tabs,
    Spinner
} from '@cloudscape-design/components';
import shellHighlight from "@cloudscape-design/code-view/highlight/sh";
import CodeView from "@cloudscape-design/code-view/code-view";
import CopyToClipboard from "@cloudscape-design/components/copy-to-clipboard";
import {applyMode, applyDensity, Density, Mode} from '@cloudscape-design/global-styles';
import {I18nProvider} from '@cloudscape-design/components/i18n';
import messages from '@cloudscape-design/components/i18n/messages/all.en';
import Settings from "./settings";
const authRequest = {scopes: [window.SCOPE]};
const LOCALE = 'en';

function ErrorComponent({error}) {
    return <p>An Error Occurred: {error}</p>;
}

function LoadingComponent() {
    return <p>Authentication in progress...</p>;
}

function S3TargetComponent(props) {
    if (props.target.length === 0) {
        return <>

            <Box color="text-body-secondary"><Spinner/> Fetching credentials</Box>
        </>;
    } else {
        return <CopyToClipboard
            copyButtonAriaLabel="Copy ARN"
            copyErrorText="Scope failed to copy"
            copySuccessText="Grant scope copied successfuly"
            textToCopy={props.target}
            variant="inline"
        />;
    }
}

export default function App({pca}) {
    const navigate = useNavigate();
    const navigationClient = new CustomNavigationClient(navigate);
    pca.setNavigationClient(navigationClient);

    return (
        <MsalProvider instance={pca}>
            <Pages />
        </MsalProvider>
    );
}

function Pages() {
    return (
        <Routes>
            <Route path="/settings" element={<Settings />} />
            <Route path="/logout" element={<Home />} />
            <Route path="/" element={<Home />} />
        </Routes>
    );
}

function Home() {
    const {instance, accounts, inProgress} = useMsal()
    const [helpPanel, setHelpPanel] = useState(false);
    const [navigationPanel, setNavigationPanel] = useState(true);
    const [darkMode, setDarkMode] = useState(false);
    const [compactMode, setCompactMode] = useState(false)
    const [compactModeIconName, setCompactModeIconName] = useState("");
    const [darkModeIconName, setDarkModeIconName] = useState("");
    const [flashbarItems, setFlashbarItems] = useState([]);
    const [idpCredsModal, setIdpCredsModal] = useState(false);
    const [grantsCredsModal, setGrantsCredsModal] = useState(false);
    const [credentials, setCredentials] = useState("");
    const [grantsList, setGrantsList] = useState([]);
    const [macLinuxCreds, setMacLinuxCreds] = useState("");
    const [windowsCreds, setWindowsCreds] = useState("");
    const [powershellCreds, setPowershellCreds] = useState("");
    const [grantScope, setGrantScope] = useState("");
    const [permission, setPermission] = useState("");
    const [expiration, setExpiration] = useState("");
    const [webConsoleUrl, setWebConsoleUrl] = useState("");

    const navigationMenuOnClick = e => {
        if (e.detail.id === 'color-mode') {
            console.log(e);
            if (!darkMode) {
                setDarkMode(true);
                setDarkModeIconName("check");
                console.log('Enabling Dark Mode');
                applyMode(Mode.Dark);
            } else {
                setDarkMode(false);
                setDarkModeIconName("");
                console.log('Enabling Light Mode');
                applyMode(Mode.Light);
            }
        } else if (e.detail.id === 'compact-mode') {
            if (!compactMode) {
                setCompactMode(true);
                setCompactModeIconName("check");
                console.log('Enabling Compact mode');
                applyDensity(Density.Compact);
            } else {
                setCompactMode(false);
                setCompactModeIconName("");
                console.log('Enabling Comfortable mode');
                applyDensity(Density.Comfortable);
            }
        } else if (e.detail.id === 'signout') {
            instance.logoutRedirect();
        }
    };

    function fetchGrantCredentials(event, item) {
        // We can only use the token once. Every request need to refresh the token
        instance.acquireTokenSilent({
            scopes: [window.SCOPE],
            account: accounts[0]
        }).then((response) => {
            if (response) {
                setCredentials(JSON.stringify(response, null, 2));
            }
        }).catch(async (error) => {
            if (error instanceof InteractionRequiredAuthError) {
                // fallback to interaction when silent call fails
                return instance.acquireTokenPopup(authRequest);
            }
        });
        setWebConsoleUrl('');
        setGrantScope('');
        setPermission('');
        setExpiration('');
        setMacLinuxCreds('');
        setWindowsCreds('');
        setPowershellCreds('');
        setGrantsCredsModal(true);
        const params = {
            Scope: item.GrantScope,
            Permission: item.Permission
        }
        fetch(window.API_ENDPOINT + '/FetchCredentials?' + new URLSearchParams(params), {
            method: 'GET',
            mode: 'cors',
            headers: {
                'Authorization': JSON.parse(credentials).accessToken
            },
        },)
            .then(response => {
                if (!response.ok) {
                    let err = new Error('HTTP status code:' + response.status)
                    err.response = response
                    err.status = response.status
                    throw err
                }
                return response.json();

            })
            .then(response => {
                console.log(response);
                const creds = response.response.Credentials;
                setMacLinuxCreds(`export AWS_ACCESS_KEY_ID="${creds.AccessKeyId}"
export AWS_SECRET_ACCESS_KEY="${creds.SecretAccessKey}"
export AWS_SESSION_TOKEN="${creds.SessionToken}"`);
                setWindowsCreds(`SET AWS_ACCESS_KEY_ID=${creds.AccessKeyId}
SET AWS_SECRET_ACCESS_KEY=${creds.SecretAccessKey}
SET AWS_SESSION_TOKEN=${creds.SessionToken}`);
                setPowershellCreds(`$Env:AWS_ACCESS_KEY_ID="${creds.AccessKeyId}"
$Env.AWS_SECRET_ACCESS_KEY="${creds.SecretAccessKey}"
$Env.AWS_SESSION_TOKEN="${creds.SessionToken}"`);
                setGrantScope(response.response.MatchedGrantTarget);
                setPermission(response.response.Permission);
                setExpiration(creds.Expiration);
                setWebConsoleUrl(response.response.ConsoleUrl);

            })
            .catch(error => {
                console.log(error);
                let items = flashbarItems;
                items.push({
                    type: "error",
                    dismissible: true,
                    dismissLabel: "Dismiss message",
                    onDismiss: () => setFlashbarItems([]),
                    content: "Unable to fetch Grants credentials",
                    id: "message_1"
                })
                setFlashbarItems(items);
            });

    }

    function fetchGrants() {
        // We need to refresh the tokens to ensure that your idToken is valid
        instance.acquireTokenSilent({
            scopes: [window.SCOPE],
            account: accounts[0]
        }).then((response) => {
            if (response) {
                setCredentials(JSON.stringify(response, null, 2));
            }
        }).catch(async (error) => {
            if (error instanceof InteractionRequiredAuthError) {
                // fallback to interaction when silent call fails
                return instance.acquireTokenPopup(authRequest);
            }
        });
        fetch(window.API_ENDPOINT + '/ListGrants', {
            method: 'GET',
            mode: 'cors',
            headers: {
                'Authorization': JSON.parse(credentials).idToken
            },
        },)
            .then(response => {
                if (!response.ok) {
                    let err = new Error('HTTP status code:' + response.status)
                    err.response = response
                    err.status = response.status
                    throw err
                }
                return response.json();
            })
            .then(response => setGrantsList(response.response))
            .catch(error => {
                console.log(error);
                let items = flashbarItems;
                items.push({
                    type: "error",
                    dismissible: true,
                    dismissLabel: "Dismiss message",
                    onDismiss: () => setFlashbarItems([]),
                    content: "Unable to fetch Grants list",
                    id: "message_1"
                })
                setFlashbarItems(items);
            });
    }

    useEffect(() => {
        if (accounts.length > 0 && inProgress === 'startup') {
            instance.acquireTokenSilent({
                scopes: [window.SCOPE],
                account: accounts[0]
            }).then((response) => {
                if (response) {
                    setCredentials(JSON.stringify(response, null, 2));
                }
            }).catch(async (error) => {
                if (error instanceof InteractionRequiredAuthError) {
                    // fallback to interaction when silent call fails
                    return instance.acquireTokenPopup(authRequest);
                }
            });
        }
    }, [accounts, instance, credentials, inProgress]);

    instance.enableAccountStorageEvents();
    instance.addEventCallback((event) => {
        if (event.eventType === EventType.LOGIN_SUCCESS) {
            const account = event.payload.account;
            instance.setActiveAccount(account);
            instance.acquireTokenSilent({
                scopes: [window.SCOPE],
                account: accounts[0]
            }).then((response) => {
                if (response) {
                    setCredentials(JSON.stringify(response, null, 2));
                }
            }).catch(async (error) => {
                if (error instanceof InteractionRequiredAuthError) {
                    // fallback to interaction when silent call fails
                    return instance.acquireTokenPopup(authRequest);
                }
            });
        } else if (event.eventType === EventType.ACCOUNT_REMOVED) {
            // Update UI with account logged out
        } else if (event.eventType === EventType.ACTIVE_ACCOUNT_CHANGED) {
            // Refresh toke in case the active account is changed
        }
    });

    return (
        <MsalAuthenticationTemplate
            interactionType={InteractionType.Popup}
            authenticationRequest={authRequest}
            errorComponent={ErrorComponent}
            loadingComponent={LoadingComponent}
        >
            <div>
                <TopNavigation
                    identity={{
                        href: "#",
                        title: "S3 Access Grants Portal",
                        logo: {
                            src: "data:image/svg+xml;base64,//48AD8AeABtAGwAIAB2AGUAcgBzAGkAbwBuAD0AIgAxAC4AMAAiACAAZQBuAGMAbwBkAGkAbgBnAD0AIgB1AHQAZgAtADEANgAiAD8APgANAAoAPAAhAC0ALQAgAEcAZQBuAGUAcgBhAHQAbwByADoAIABBAGQAbwBiAGUAIABJAGwAbAB1AHMAdAByAGEAdABvAHIAIAAxADQALgAwAC4AMAAsACAAUwBWAEcAIABFAHgAcABvAHIAdAAgAFAAbAB1AGcALQBJAG4AIAAuACAAUwBWAEcAIABWAGUAcgBzAGkAbwBuADoAIAA2AC4AMAAwACAAQgB1AGkAbABkACAANAAzADMANgAzACkAIAAgAC0ALQA+AA0ACgA8ACEARABPAEMAVABZAFAARQAgAHMAdgBnACAAUABVAEIATABJAEMAIAAiAC0ALwAvAFcAMwBDAC8ALwBEAFQARAAgAFMAVgBHACAAMQAuADEALwAvAEUATgAiACAAIgBoAHQAdABwADoALwAvAHcAdwB3AC4AdwAzAC4AbwByAGcALwBHAHIAYQBwAGgAaQBjAHMALwBTAFYARwAvADEALgAxAC8ARABUAEQALwBzAHYAZwAxADEALgBkAHQAZAAiAD4ADQAKADwAcwB2AGcAIAB2AGUAcgBzAGkAbwBuAD0AIgAxAC4AMQAiACAAaQBkAD0AIgBMAGEAeQBlAHIAXwAxACIAIAB4AG0AbABuAHMAPQAiAGgAdAB0AHAAOgAvAC8AdwB3AHcALgB3ADMALgBvAHIAZwAvADIAMAAwADAALwBzAHYAZwAiACAAeABtAGwAbgBzADoAeABsAGkAbgBrAD0AIgBoAHQAdABwADoALwAvAHcAdwB3AC4AdwAzAC4AbwByAGcALwAxADkAOQA5AC8AeABsAGkAbgBrACIAIAB4AD0AIgAwAHAAeAAiACAAeQA9ACIAMABwAHgAIgANAAoACQAgAHcAaQBkAHQAaAA9ACIANwAwAHAAeAAiACAAaABlAGkAZwBoAHQAPQAiADcAMABwAHgAIgAgAHYAaQBlAHcAQgBvAHgAPQAiADAAIAAwACAANwAwACAANwAwACIAIABlAG4AYQBiAGwAZQAtAGIAYQBjAGsAZwByAG8AdQBuAGQAPQAiAG4AZQB3ACAAMAAgADAAIAA3ADAAIAA3ADAAIgAgAHgAbQBsADoAcwBwAGEAYwBlAD0AIgBwAHIAZQBzAGUAcgB2AGUAIgA+AA0ACgA8AGcAPgANAAoACQA8AGcAPgANAAoACQAJADwAZwA+AA0ACgAJAAkACQA8AGcAPgANAAoACQAJAAkACQA8AHAAYQB0AGgAIABmAGkAbABsAC0AcgB1AGwAZQA9ACIAZQB2AGUAbgBvAGQAZAAiACAAYwBsAGkAcAAtAHIAdQBsAGUAPQAiAGUAdgBlAG4AbwBkAGQAIgAgAGYAaQBsAGwAPQAiACMAMQA0ADYARQBCADQAIgAgAGQAPQAiAE0ANgAzAC4AOQA1ACwAMQA1AC4ANwA4ADYAYwAwACwANAAuADAAMAA2AC0AMQAyAC4AOQA2ADMALAA3AC4AMgAzADgALQAyADgALgA5ADQAOQAsADcALgAyADMAOAANAAoACQAJAAkACQAJAGMALQAxADUALgA5ADgAOAAsADAALQAyADgALgA5ADUAMQAtADMALgAyADMAMgAtADIAOAAuADkANQAxAC0ANwAuADIAMwA4AGwAOQAuADYANQAsADQAMwAuADgAMwA5AGMAMAAsADIALgA2ADcAMgAsADgALgA2ADMANwAsADQALgA4ADIANgAsADEAOQAuADMAMAAxACwANAAuADgAMgA2AGMAMQAwAC4ANgA2ADIALAAwACwAMQA5AC4AMgA5ADkALQAyAC4AMQA1ADQALAAxADkALgAyADkAOQAtADQALgA4ADIANgBsADAALAAwAA0ACgAJAAkACQAJAAkATAA2ADMALgA5ADUALAAxADUALgA3ADgANgB6ACIALwA+AA0ACgAJAAkACQA8AC8AZwA+AA0ACgAJAAkACQA8AGcAPgANAAoACQAJAAkACQA8AHAAYQB0AGgAIABmAGkAbABsAC0AcgB1AGwAZQA9ACIAZQB2AGUAbgBvAGQAZAAiACAAYwBsAGkAcAAtAHIAdQBsAGUAPQAiAGUAdgBlAG4AbwBkAGQAIgAgAGYAaQBsAGwAPQAiACMAMQA0ADYARQBCADQAIgAgAGQAPQAiAE0ANgAzAC4AOQA1ACwAMQAyAC4ANwA4ADYAYwAwAC0ANAAuADAAMAA0AC0AMQAyAC4AOQA2ADMALQA3AC4AMgAzADcALQAyADgALgA5ADQAOQAtADcALgAyADMANwANAAoACQAJAAkACQAJAGMALQAxADUALgA5ADgAOAAsADAALQAyADgALgA5ADUAMQAsADMALgAyADMAMwAtADIAOAAuADkANQAxACwANwAuADIAMwA3AGMAMAAsADQALgAwADAANgAsADEAMgAuADkANgAzACwANwAuADIAMwA4ACwAMgA4AC4AOQA1ADEALAA3AC4AMgAzADgAQwA1ADAALgA5ADgANwAsADIAMAAuADAAMgA0ACwANgAzAC4AOQA1ACwAMQA2AC4ANwA5ADIALAA2ADMALgA5ADUALAAxADIALgA3ADgANgBMADYAMwAuADkANQAsADEAMgAuADcAOAA2AA0ACgAJAAkACQAJAAkAegAiAC8APgANAAoACQAJAAkAPAAvAGcAPgANAAoACQAJADwALwBnAD4ADQAKAAkAPAAvAGcAPgANAAoAPAAvAGcAPgANAAoAPAAvAHMAdgBnAD4ADQAKAA==",
                            alt: "S3"
                        }
                    }}
                    utilities={[
                        {
                            type: "button",
                            text: "S3 Access Grants",
                            href: "https://aws.amazon.com/s3/features/access-grants/",
                            external: true,
                            externalIconAriaLabel: " (opens in a new tab)"
                        },
                        {
                            type: "menu-dropdown",
                            iconName: "settings",
                            ariaLabel: "Settings",
                            title: "Settings",
                            items: [
                                {
                                    id: "settings-org",
                                    text: "Organizational settings"
                                },
                                {
                                    id: "settings-project",
                                    text: "Project settings",
                                    href: "/settings",
                                }
                            ]
                        },
                        {
                            type: "menu-dropdown",
                            text: accounts[0]?.name,
                            onItemClick: navigationMenuOnClick,
                            description: accounts[0]?.username,
                            iconName: "user-profile",
                            items: [
                                {
                                    id: "color-mode",
                                    text: "Dark Mode",
                                    iconName: darkModeIconName,
                                },
                                {
                                    id: "compact-mode",
                                    text: "Compact Mode",
                                    iconName: compactModeIconName,
                                },
                                {
                                    id: "support-group",
                                    text: "Support",
                                    items: [
                                        {
                                            id: "documentation",
                                            text: "Documentation",
                                            href: "#",
                                            external: true,
                                            externalIconAriaLabel:
                                                " (opens in new tab)"
                                        },
                                        {id: "support", text: "Support"},
                                        {
                                            id: "feedback",
                                            text: "Feedback",
                                            href: "#",
                                            external: true,
                                            externalIconAriaLabel:
                                                " (opens in new tab)"
                                        }
                                    ]
                                },
                                {id: "signout", text: "Sign out"}
                            ]
                        }
                    ]}
                />
            </div>
            <I18nProvider locale={LOCALE} messages={[messages]}>
                <AppLayout
                    breadcrumbs={
                        <BreadcrumbGroup
                            items={[
                                {text: 'Home', href: '#'},
                                {text: 'Grants', href: '#'},
                            ]}
                        />
                    }
                    navigationOpen={navigationPanel}
                    onNavigationChange={({detail}) => setNavigationPanel(detail.open)}
                    navigation={
                        <SideNavigation
                            header={{
                                href: '#',
                                text: 'Portal',
                            }}
                            items={[
                                {type: 'link', text: `S3 Access Grants`, href: `#`},
                                {type: 'link', text: `Settings`, href: `/settings`}
                            ]}
                        />
                    }
                    notifications={
                        <Flashbar
                            items={flashbarItems}
                        />
                    }
                    toolsOpen={helpPanel}
                    onToolsChange={({detail}) => setHelpPanel(detail.open)}
                    tools={<HelpPanel header={<h2>Overview</h2>}>Help content</HelpPanel>}
                    content={
                        <ContentLayout
                            header={
                                <Header variant="h1" info={<Link variant="info">Info</Link>}>
                                    S3 Access Grants Portal
                                </Header>
                            }
                        >
                            <SpaceBetween size="l">
                                <Container
                                    header={
                                        <Header
                                            variant="h2"
                                            description="View your Entra Id Credentials"
                                            actions={
                                                <SpaceBetween
                                                    direction="horizontal"
                                                    size="xs"
                                                >
                                                    <Button
                                                        onClick={() => setIdpCredsModal(true)}
                                                    >Show Credentials</Button>
                                                </SpaceBetween>
                                            }
                                        >
                                            IdP Credentials
                                        </Header>
                                    }
                                >
                                    <div>
                                        <Modal
                                            onDismiss={() => setIdpCredsModal(false)}
                                            visible={idpCredsModal}
                                            size="large"
                                            footer={
                                                <Box float="right">
                                                    <SpaceBetween direction="horizontal" size="xs">
                                                        <Button
                                                            variant="primary"
                                                            onClick={() => setIdpCredsModal(false)}
                                                        >Close</Button>
                                                    </SpaceBetween>
                                                </Box>
                                            }
                                            header="Entra Id Credentials"
                                        >
                                            <CodeView
                                                content={credentials}
                                            />
                                        </Modal>
                                    </div>
                                </Container>
                                <Container
                                    header={
                                        <Header variant="h2"
                                                description="Select the S3 access and click Access"
                                                actions={
                                                    <SpaceBetween
                                                        direction="horizontal"
                                                        size="xs"
                                                    >
                                                        <Button
                                                            onClick={() => fetchGrants()}
                                                        >Fetch Grants</Button>
                                                    </SpaceBetween>}
                                        >
                                            List of Grants available
                                        </Header>
                                    }
                                >
                                    <Cards
                                        ariaLabels={{
                                            itemSelectionLabel: (e, t) => `select ${t.name}`,
                                            selectionGroupLabel: "Item selection"
                                        }}
                                        cardDefinition={{
                                            header: item => (
                                                <Button onClick={(e) => fetchGrantCredentials(e, item)}>Get
                                                    Credentials</Button>
                                            ),
                                            sections: [
                                                {
                                                    id: "scope",
                                                    header: "Grant Scope",
                                                    content: item => item.GrantScope
                                                },
                                                {
                                                    id: "Permission",
                                                    header: "Permission",
                                                    content: item => item.Permission
                                                },
                                                {
                                                    id: "location",
                                                    header: "Access Grants Location",
                                                    content: item => item.AccessGrantsLocationId
                                                }
                                            ]
                                        }}
                                        cardsPerRow={[
                                            {cards: 1},
                                            {minWidth: 500, cards: 2}
                                        ]}
                                        items={grantsList}
                                        loadingText="Loading resources"
                                        empty={
                                            <Box
                                                margin={{vertical: "xs"}}
                                                textAlign="center"
                                                color="inherit"
                                            >
                                                <SpaceBetween size="m">
                                                    <b>No Grants</b>
                                                    <Button onClick={() => fetchGrants()}>Fetch Grants</Button>
                                                </SpaceBetween>
                                            </Box>
                                        }
                                        // header={<Header>Header</Header>}
                                    />
                                    <div>
                                        <Modal
                                            onDismiss={() => setGrantsCredsModal(false)}
                                            visible={grantsCredsModal}
                                            size="large"
                                            footer={
                                                <Box float="right">
                                                    <SpaceBetween direction="horizontal" size="xs">
                                                        <Button
                                                            variant="primary"
                                                            onClick={() => setGrantsCredsModal(false)}
                                                        >Close</Button>
                                                    </SpaceBetween>
                                                </Box>
                                            }
                                            header="S3 Access Grants Credentials"
                                        >
                                            <SpaceBetween size="l">
                                                <Container
                                                    header={
                                                        <Header
                                                            variant="h2"
                                                            actions={
                                                                <Button
                                                                    iconAlign="right"
                                                                    iconName="external"
                                                                    href={webConsoleUrl}
                                                                    target="_blank"
                                                                    variant="primary">
                                                                    Open Web Console
                                                                </Button>
                                                            }
                                                        >Grant Scope</Header>
                                                    }
                                                >
                                                    <S3TargetComponent target={grantScope}/>
                                                    <Box margin={{top: "l", bottom: "xxs"}}
                                                         variant="h2">Permission</Box>
                                                    <Box>{permission}</Box>
                                                    <Box margin={{top: "l", bottom: "xxs"}}
                                                         variant="h2">Expiration</Box>
                                                    <Box>{expiration}</Box>
                                                </Container>
                                            </SpaceBetween>
                                            <Tabs
                                                tabs={[
                                                    {
                                                        label: "macOS and Linux",
                                                        id: "first",
                                                        content: (<CodeView
                                                            content={macLinuxCreds}
                                                            highlight={shellHighlight}
                                                            actions={
                                                                <CopyToClipboard
                                                                    copyButtonAriaLabel="Copy code"
                                                                    copyErrorText="Code failed to copy"
                                                                    copySuccessText="Code copied"
                                                                    textToCopy={macLinuxCreds}
                                                                />
                                                            }
                                                        />)
                                                    },
                                                    {
                                                        label: "Windows",
                                                        id: "second",
                                                        content: (<CodeView
                                                            content={windowsCreds}
                                                            highlight={shellHighlight}
                                                            actions={
                                                                <CopyToClipboard
                                                                    copyButtonAriaLabel="Copy code"
                                                                    copyErrorText="Code failed to copy"
                                                                    copySuccessText="Code copied"
                                                                    textToCopy={windowsCreds}
                                                                />
                                                            }
                                                        />)
                                                    },
                                                    {
                                                        label: "PowerShell",
                                                        id: "third",
                                                        content: (<CodeView
                                                            content={powershellCreds}
                                                            highlight={shellHighlight}
                                                            actions={
                                                                <CopyToClipboard
                                                                    copyButtonAriaLabel="Copy code"
                                                                    copyErrorText="Code failed to copy"
                                                                    copySuccessText="Code copied"
                                                                    textToCopy={powershellCreds}
                                                                />
                                                            }
                                                        />)
                                                    }
                                                ]}
                                            />
                                        </Modal>
                                    </div>
                                </Container>
                            </SpaceBetween>
                        </ContentLayout>
                    }
                />
            </I18nProvider>
        </MsalAuthenticationTemplate>
    );
}
