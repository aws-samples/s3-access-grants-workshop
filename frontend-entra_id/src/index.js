// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import {PublicClientApplication} from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import React from 'react';
import ReactDOM from 'react-dom/client';
import "@cloudscape-design/global-styles/index.css"
import App from './App';
import app_config from './config';

const config = {
    auth: {
        clientId: app_config.clientId,
        authority: 'https://login.microsoftonline.com/' + app_config.tenantId + '/v2.0',
        redirectUri: "/",
        postLogoutRedirectUri: "/",
        scope: app_config.scope
    },
    cache: {
        cacheLocation: "localStorage", // "sessionStorage"
    }
};
const msalInstance = new PublicClientApplication(config);
msalInstance.initialize().then(() => {
    // Default to using the first account if no account is active on page load
    if (!msalInstance.getActiveAccount() && msalInstance.getAllAccounts().length > 0) {
        // Account selection logic is app dependent. Adjust as needed for different use cases.
        msalInstance.setActiveAccount(msalInstance.getAllAccounts()[0]);
    }

    const myAccounts = msalInstance.getAllAccounts();
    console.log(myAccounts);
    const root = ReactDOM.createRoot(document.getElementById('root'));

    root.render(
        <React.StrictMode>
            <MsalProvider instance={msalInstance}>
                <App pca={msalInstance}/>
            </ MsalProvider>
        </React.StrictMode>
    );

});



