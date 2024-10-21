// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import {PublicClientApplication} from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router } from "react-router-dom";
import "@cloudscape-design/global-styles/index.css"
import App from './App';

const config = {
    auth: {
        clientId: window.AUDIENCE,
        authority: 'https://login.microsoftonline.com/' + window.TENANT_ID + '/v2.0',
        redirectUri: "/",
        postLogoutRedirectUri: "/",
        scope: window.SCOPE
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

    // const myAccounts = msalInstance.getAllAccounts();
    const root = ReactDOM.createRoot(document.getElementById('root'));

    root.render(
        <React.StrictMode>
            <Router>
                <MsalProvider instance={msalInstance}>
                    <App pca={msalInstance}/>
                </ MsalProvider>
            </Router>
        </React.StrictMode>
    );

});

