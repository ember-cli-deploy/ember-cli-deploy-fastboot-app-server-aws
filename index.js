/* eslint-env node */
'use strict';

const DeployPluginBase = require('ember-cli-deploy-plugin');

function _list(opts) {
  let AWS  = require('aws-sdk');
  let RSVP = require('rsvp');

  let accessKeyId     = opts.accessKeyId;
  let secretAccessKey = opts.secretAccessKey;
  let archivePrefix   = opts.archivePrefix;
  let bucket          = opts.bucket;
  let region          = opts.region;
  let profile         = opts.profile;
  let manifestKey     = opts.manifestKey

  let client = new AWS.S3({
    accessKeyId,
    secretAccessKey,
    region
  });

  if (profile) {
    AWS.config.credentials = new AWS.SharedIniFileCredentials({
      profile: profile
    });
  }

  let listObjects = RSVP.denodeify(client.listObjects.bind(client));
  let getObject   = RSVP.denodeify(client.getObject.bind(client));

  let revisionsResults;

  return listObjects({ Bucket: bucket, Prefix: archivePrefix })
    .then((results) => {
      revisionsResults = results;
      return getObject({ Bucket: bucket, Key: manifestKey });
    })
    .then((current) => {
      return { revisions: revisionsResults, current };
    })
    .catch(() => {
      return { revisions: revisionsResults, current: { Body: '{}'} };
    })
    .then((result) => {
      if (!result.revisions || result.revisions.length < 1) {
        return { revisions: [] };
      }

      let revisionsData = result.revisions;
      let current = result.current;
      let data = revisionsData.Contents;
      let body = current.Body;

      let manifestData = JSON.parse(body);

      let revisions = data.sort(function(a, b) {
        return new Date(b.LastModified) - new Date(a.LastModified);
      })
      .map((d) => {
        let match = d.Key.match(new RegExp(archivePrefix+'(.*)\\.zip'));
        if (!match) {
          return; // ignore files that are no zipped app builds
        }

        let revision = match[1];
        return {
          revision,
          timestamp: d.LastModified,
          active: d.Key === manifestData.key
        }
      }).filter((d) => d); // filter out empty values

      return { revisions };
    });
}

module.exports = {
  name: 'ember-cli-deploy-fastboot-app-server-aws',

  createDeployPlugin: function(options) {
    let DeployPlugin = DeployPluginBase.extend({
      name: options.name,

      defaultConfig: {
        archivePrefix: function(context) {
          return context.fastbootArchivePrefix;
        },

        revisionKey: function(context) {
          let revisionKey = context.revisionData && context.revisionData.revisionKey;
          return context.commandOptions.revision || revisionKey;
        },

        downloaderManifestContent: function(context) {
          // setup via ember-cli-deploy-fastboot-app-server plugin
          return context.fastbootDownloaderManifestContent;
        },

        manifestKey: 'fastboot-deploy-info.json',
        awsPrefix: ''
      },

      requiredConfig: ['bucket', 'region'],

      activate: function(/* context */) {
        let revisionKey   = this.readConfig('revisionKey');
        let bucket        = this.readConfig('bucket');
        let archivePrefix = this.readConfig('archivePrefix');
        let awsPrefix     = this.readConfig('awsPrefix');
        // update manifest-file to point to passed revision
        let downloaderManifestContent = this.readConfig('downloaderManifestContent');

        let buildKey        = `${archivePrefix}${revisionKey}.zip`;
        if (awsPrefix) {
          buildKey = `${awsPrefix}/${buildKey}`;
        }

        this.log(`creating manifest for bucket: ${bucket} and buildKey: ${buildKey}`, {verbose: true});
        let manifest        = downloaderManifestContent(bucket, buildKey);
        let AWS             = require('aws-sdk');
        let RSVP            = require('rsvp');
        let accessKeyId     = this.readConfig('accessKeyId');
        let secretAccessKey = this.readConfig('secretAccessKey');
        let region          = this.readConfig('region');
        let manifestKey     = this.readConfig('manifestKey');

        manifestKey = awsPrefix ? `${awsPrefix}/${manifestKey}` : manifestKey;

        let client = new AWS.S3({
          accessKeyId,
          secretAccessKey,
          region
        });
        let putObject = RSVP.denodeify(client.putObject.bind(client));

        this.log(`updating manifest at ${manifestKey}`, {verbose: true});

        return putObject({
          Bucket: bucket,
          Key: manifestKey,
          Body: manifest,
          ACL: 'public-read'
        });
      },

      upload: function(context) {
        let AWS = require('aws-sdk');
        let RSVP = require('rsvp');
        let fs = require('fs');

        let accessKeyId     = this.readConfig('accessKeyId');
        let secretAccessKey = this.readConfig('secretAccessKey');
        let bucket          = this.readConfig('bucket');
        let region          = this.readConfig('region');
        let awsPrefix       = this.readConfig('awsPrefix');

        let client = new AWS.S3({
          accessKeyId,
          secretAccessKey,
          region
        });

        let putObject = RSVP.denodeify(client.putObject.bind(client));

        let data = fs.readFileSync(context.fastbootArchivePath);

        let key = awsPrefix ? `${awsPrefix}/${context.fastbootArchiveName}` : context.fastbootArchiveName;

        this.log(`uploading fastboot archive to ${bucket}/${key}`, {verbose: true});
        return putObject({
          Bucket: bucket,
          Body: data,
          Key: key
        });
      },

      fetchRevisions: function() {
        let accessKeyId     = this.readConfig('accessKeyId');
        let secretAccessKey = this.readConfig('secretAccessKey');
        let archivePrefix   = this.readConfig('archivePrefix');
        let bucket          = this.readConfig('bucket');
        let region          = this.readConfig('region');
        let profile         = this.readConfig('profile');
        let manifestKey     = this.readConfig('manifestKey');
        let awsPrefix       = this.readConfig('awsPrefix');

        archivePrefix = awsPrefix ? `${awsPrefix}/${archivePrefix}` : archivePrefix;
        manifestKey   = awsPrefix ? `${awsPrefix}/${manifestKey}` : manifestKey;

        let opts = {
          accessKeyId, secretAccessKey, archivePrefix, bucket, region, profile, manifestKey
        };

        return _list(opts)
          .then((data) => {
            let revisions = data.revisions;
            revisions.forEach(r => {
              this.log(`${r.revision} | ${r.timestamp} | active: ${r.active}`, {verbose: true});
          });
          return { revisions };
        });
      },

      fetchInitialRevisions: function() {
        let accessKeyId     = this.readConfig('accessKeyId');
        let secretAccessKey = this.readConfig('secretAccessKey');
        let archivePrefix   = this.readConfig('archivePrefix');
        let bucket          = this.readConfig('bucket');
        let region          = this.readConfig('region');
        let profile         = this.readConfig('profile');
        let manifestKey     = this.readConfig('manifestKey');
        let awsPrefix       = this.readConfig('awsPrefix');

        archivePrefix = awsPrefix ? `${awsPrefix}/${archivePrefix}` : archivePrefix;
        manifestKey   = awsPrefix ? `${awsPrefix}/${manifestKey}` : manifestKey;

        let opts = {
          accessKeyId, secretAccessKey, archivePrefix, bucket, region, profile, manifestKey
        };

        return _list(opts, this)
          .then((data) =>  {
            let revisions = data.revisions;
            revisions.forEach(r => {
              this.log(`${r.revision} | ${r.timestamp} | active: ${r.active}`, {verbose: true});
            });

            return { initialRevisions: revisions };
          });
      }
    });

    return new DeployPlugin();
  }
};
