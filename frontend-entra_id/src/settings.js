import * as React from "react";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Button from "@cloudscape-design/components/button";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import CopyToClipboard from "@cloudscape-design/components/copy-to-clipboard";

function Settings() {

    return ( <ContentLayout
            defaultPadding
            headerVariant="high-contrast"
            header={
                <Header
                    variant="h1"
                    info={<Link variant="info">Info</Link>}
                    description="This is the application configuration settings."
                    actions={
                        <Button variant="primary"
                                onClick={() => {window.location.href = "/";}}
                        >Back</Button>
                    }
                >
                    Settings
                </Header>
            }
        >
            <Container
                header={
                    <Header variant="h2">Configuration Settings</Header>
                }
            >
                <KeyValuePairs
                    items={[
                        {
                            label: "AUDIENCE",
                            value: (
                                <CopyToClipboard
                                    copyButtonAriaLabel="Copy AUDIENCE"
                                    copyErrorText="AUDIENCE failed to copy"
                                    copySuccessText="AUDIENCE copied"
                                    textToCopy={window.AUDIENCE}
                                    variant="inline"
                                />
                            )
                        },
                        {
                            label: "TENANT_ID",
                            value: (
                                <CopyToClipboard
                                    copyButtonAriaLabel="Copy TENANT_ID"
                                    copyErrorText="TENANT_ID failed to copy"
                                    copySuccessText="TENANT_ID copied"
                                    textToCopy={window.TENANT_ID}
                                    variant="inline"
                                />
                            )
                        },
                        {
                            label: "SCOPE",
                            value: (
                                <CopyToClipboard
                                    copyButtonAriaLabel="Copy SCOPE"
                                    copyErrorText="SCOPE failed to copy"
                                    copySuccessText="SCOPE copied"
                                    textToCopy={window.SCOPE}
                                    variant="inline"
                                />
                            )
                        },
                        {
                            label: "API_ENDPOINT",
                            value: (
                                <CopyToClipboard
                                    copyButtonAriaLabel="Copy API_ENDPOINT"
                                    copyErrorText="API_ENDPOINT failed to copy"
                                    copySuccessText="API_ENDPOINT copied"
                                    textToCopy={window.API_ENDPOINT}
                                    variant="inline"
                                />
                            )
                        }
                        ]}
                    />
            </Container>
        </ContentLayout>
    );
}

export default Settings;
