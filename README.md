# ember-cli-deploy-fastboot-app-server-aws

> An ember-cli-deploy plugin to deploy Ember FastBoot apps that are deployed via [fastboot-app-server](https://github.com/ember-fastboot/fastboot-app-server) to [AWS](https://aws.amazon.com) (S3)

This plugin is not a standalone plugin. You will need to have a zipped fastboot-build available on the deployment context. This plugin works best in combination with [ember-cli-deploy-fastboot-app-server](https://github.com/LevelbossMike/ember-cli-deploy-fastboot-app-server).

## What is an ember-cli-deploy plugin?

A plugin is an addon that can be executed as a part of the ember-cli-deploy pipeline. A plugin will implement one or more of the ember-cli-deploy's pipeline hooks.

For more information on what plugins are and how they work, please refer to the [Plugin Documentation][2].

## Quick Start
To get up and running quickly, do the following:

- Ensure [ember-cli-fastboot](https://github.com/ember-fastboot/ember-cli-fastboot) is installed.
- Ensure [ember-cli-deploy-build][4] is installed and configured.
- Ensure [ember-cli-deploy-revision-data][6] is installed and configured.
- Ensure [ember-cli-deploy-display-revisions](https://github.com/duizendnegen/ember-cli-deploy-display-revisions) is installed and configured.
- Ensure [ember-cli-deploy-fastboot-app-server](https://github.com/levelbossmike/ember-cli-deploy-fastboot-app-server) is installed and configured.

- Install this plugin

```bash
$ ember install ember-cli-deploy-fastboot-app-server-aws
```
- Run the pipeline

```bash
$ ember deploy production
```

## ember-cli-deploy Hooks Implemented

For detailed information on what plugin hooks are and how they work, please refer to the [Plugin Documentation][2].

- `configure`
- `upload`
- `fetchInitialRevisions`
- `fetchRevisions`
- `activate`

## Configuration Options

For detailed information on how configuration of plugins works, please refer to the [Plugin Documentation][2].

### accessKeyId

The AWS access key for the user that has the ability to upload to the `bucket`. If this is left undefined, the normal [AWS SDK credential resolution][7] will take place.

*Default:* `undefined`

### secretAccessKey

The AWS secret for the user that has the ability to upload to the `bucket`. This must be defined when `accessKeyId` is defined.

*Default:* `undefined`

### bucket (`required`)

The AWS bucket that the files will be uploaded to.

*Default:* `undefined`

### region (`required`)

The region your bucket is located in. (e.g. set this to `eu-west-1` if your bucket is located in the 'Ireland' region)

*Default:* `undefined`

### revisionKey

The unique revision number for the version of the app. By default this option will use either the `revision` passed in from the command line or the `revisionData.revisionKey` property from the deployment context.

*Default:* `context.commandOptions.revision || context.revisionData.revisionKey`

### archivePrefix

The prefix that will be used in combination with a revisionKey to build up the identifier for the revision you are deploying. In the default case this gets added to the deploy context via `ember-cli-deploy-fastboot-app-server`.

*Default:* `context.fastbootArchivePrefix` (added by `ember-cli-deploy-fastboot-app-server`)

### downloaderManifestContent

A function that gets added to the deploy context so that other plugins can update an app-manifest file that is used by [fastboot-app-server notifiers](https://github.com/ember-fastboot/fastboot-app-server#notifiers) and [-downloaders](https://github.com/ember-fastboot/fastboot-app-server#downloaders) to update the FastBoot-app served via `fastboot-app-server`.

*Default:* `context.fastbootDownloaderManifestContent` (added by `ember-cli-deploy-fastboot-app-server`)

## TL;DR

### What does this plugin do exactly?
This plugin is meant to be used in combination with [ember-cli-deploy-fastboot-app-server](https://github.com/levelbossmike/ember-cli-deploy-fastboot-app-server). This plugin will upload the zipped fastboot-build to [S3](https://aws.amazon.com/de/s3/) and can be used to implement the [lightning-strategy](http://ember-cli-deploy.com/docs/v1.0.x/the-lightning-strategy/) that you are used to with `ember-cli-deploy` with FastBoot-applications.

This means you can list available revisions via `ember deploy:list` and switch around the revisions that are served to you users via the `ember deploy:activate`-command.

### How do I activate a revision?

A user can activate a revision by either:

- Passing a command line argument to the `deploy` command:

```bash
$ ember deploy --activate=true
```

- Running the `deploy:activate` command:

```bash
$ ember deploy:activate --revision <revision-key>
```

- Setting the `activateOnDeploy` flag in `deploy.js`

```javascript
ENV.pipeline = {
  activateOnDeploy: true
}
```

### What does activation do?

When *ember-cli-deploy-fastboot-app-server* uploads a zipped FastBoot-build-file to S3, it uploads it under the key defined by a combination of the two config properties `archivePrefix` and `revisionKey`.

So, if the `archivePrefix` was configured to be `dist-` and there had been a few revisons deployed, then your bucket might look something like this:

```bash
$ aws s3 ls s3://<bucket>/
                           PRE assets/
2017-07-15 07:47:42       1207 fastboot-deploy-info.json
2017-07-15 07:25:51       1207 dist-a644ba43cdb987288d646c5a97b1c8a9.zip
2017-07-15 07:20:27       1207 dist-61cfff627b79058277e604686197bbbd.zip
2017-07-15 07:19:11       1207 dist-9dd26dbc8f3f9a8a342d067335315a63.zip
```

To activate a revision the plugin will update the contents of `fastboot-deploy-info.json` to point to the passed revision as the active revision. As soon as manifest-file has been updated an [fastboot-app-server-notifier](https://github.com/ember-fastboot/fastboot-app-server#notifiers) will notice the update and trigger an [fastboot-app-server-downloader](https://github.com/ember-fastboot/fastboot-app-server#downloaders) to update the version of your application served via a [fastboot-app-server](https://github.com/ember-fastboot/fastboot-app-server).

```bash
$ ember deploy:activate --revision a644ba43cdb987288d646c5a97b1c8a9
```

### When does activation occur?

Activation occurs during the `activate` hook of the pipeline. By default, activation is turned off and must be explicitly enabled by one of the 3 methods above.

## Prerequisites

The following properties are expected to be present on the deployment `context` object:

- `distDir`                     (provided by [ember-cli-deploy-build][4])
- `project.name()`              (provided by [ember-cli-deploy][5])
- `revisionKey`                 (provided by [ember-cli-deploy-revision-data][6])
- `commandLineArgs.revisionKey` (provided by [ember-cli-deploy][5])
- `deployEnvironment`           (provided by [ember-cli-deploy][5])

## Running Tests
You need to have a bucket on S3 setup for the test to complete. Tests expect
specific environment variables to be set so that tests are able to upload to
s3 automatically:

* `AWS_ACCESS_KEY_ID` - to authenticate with AWS
* `AWS_SECRET_ACCESS_KEY` - to authenticate with AWS
* `TEST_BUCKET` - the name of the test bucket
* `TEST_REGION` - the region the test bucket is located in

To run tests:

* `yarn test`

[2]: http://ember-cli.github.io/ember-cli-deploy/plugins "Plugin Documentation"
[4]: https://github.com/ember-cli-deploy/ember-cli-deploy-build "ember-cli-deploy-build"
[5]: https://github.com/ember-cli/ember-cli-deploy "ember-cli-deploy"
[6]: https://github.com/ember-cli-deploy/ember-cli-deploy-revision-data "ember-cli-deploy-revision-data"
[7]: https://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html#Setting_AWS_Credentials "Setting AWS Credentials"
