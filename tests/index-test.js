/* eslint-env node */
'use strict';

const fs     = require('fs');
const AWS    = require('aws-sdk');
const RSVP   = require('RSVP');
const assert = require('./helpers/assert');
const client = new AWS.S3({
  region: process.env.TEST_REGION
});
const get  = RSVP.denodeify(client.getObject.bind(client));
const list = RSVP.denodeify(client.listObjects.bind(client));
const del  = RSVP.denodeify(client.deleteObjects.bind(client));
const put  = RSVP.denodeify(client.putObject.bind(client));
const all  = RSVP.all;

function setupTestData() {
  function cleanBucket() {
    return list({ Bucket: process.env.TEST_BUCKET })
      .then((data) => data.Contents.map((d) => { return { Key: d.Key }; }))
      .then((objects) => {
        if (!objects.length) {
          return;
        }

        return del({
          Bucket: process.env.TEST_BUCKET,
          Delete: {
            Objects: objects
          }
        });
      });
  }

  function addTestData() {
    let existingDists = ['dist-12.zip', 'dist-34.zip', 'dist-56.zip'];
    let promises = existingDists.map((n) => {
      return put({ Bucket: process.env.TEST_BUCKET, Key: n, Body: 'Body: ' + n });
    });
    promises.push(put({
      Bucket: process.env.TEST_BUCKET,
      Key: 'fastboot-deploy-info.json',
      Body: JSON.stringify({
        bucket: process.env.TEST_BUCKET,
        key: 'dist-34.zip'
      })
    }));

    return all(promises);
  }

  return cleanBucket()
    .then(addTestData);
}

var stubProject = {
  name: function() {
    return 'my-project';
  }
};

describe('fastboot-app-server-aws plugin', function() {
  var subject, plugin, mockUI, context;

  before(function() {
    subject = require('../index');
  });

  beforeEach(function() {
    mockUI = {
      verbose: true,
      messages: [],
      write: function() { },
      writeLine: function(message) {
        this.messages.push(message);
      }
    };

    plugin = subject.createDeployPlugin({
      name: 'fastboot-app-server-aws'
    });

    context = {
      ui: mockUI,

      project: stubProject,

      commandOptions: {},

      fastbootArchivePrefix: 'dist-',

      fastbootDownloaderManifestContent: function(bucket, key) {
        return `
          {
            "bucket": "${bucket}",
            "key": "${key}"
          }
        `;
      },

      config: {
        'fastboot-app-server-aws': {
          bucket: process.env.TEST_BUCKET,
          region: process.env.TEST_REGION

        }
      }
    }
  });

  it('has a name', function() {
    assert.equal(plugin.name, 'fastboot-app-server-aws');
  });

  describe('hooks', function() {
    beforeEach(function() {
      plugin.beforeHook(context);
      plugin.configure(context);
      return setupTestData();
    });

    it('implements the correct hooks', function() {
      assert.ok(plugin.configure);
      assert.ok(plugin.upload);
      assert.ok(plugin.activate);
      assert.ok(plugin.fetchRevisions);
      assert.ok(plugin.fetchInitialRevisions);
    });

    describe('#upload', function() {
      afterEach(() => {
        fs.unlinkSync('dist-78.zip');
      });

      it('uploads whatever is in `context.fastbootArchivePath` to S3', function() {
        this.timeout(5000);

        let FILE_NAME = 'dist-78.zip';
        let CONTENT   = 'testtest';

        fs.writeFileSync(FILE_NAME, CONTENT);

        context.fastbootArchivePath = FILE_NAME;
        context.fastbootArchiveName = FILE_NAME;

        return plugin.upload(context)
          .then(() => {
            return get({ Bucket: process.env.TEST_BUCKET, Key: FILE_NAME });
          })
          .then((data) => {
            assert.equal(data.Body, CONTENT, 'file was uploaded correctly');
          })
          .catch(() => {
            assert.isTrue(false, 'upload failed');
          });
      });
    });

    describe('#fetchRevisions', function() {
      it('returns a list of available revisions and the current active one', function() {
        this.timeout(5000);
        return plugin.fetchRevisions(context)
          .then((data) => {
            let revisions = data.revisions.map((d) => d.revision);
            assert.deepEqual(revisions, ['12', '34', '56']);
            assert.isTrue(data.revisions[1].active, 'revision 34 marked current');
          });
      });
    });

    describe('#fetchInitialRevisions', function() {
      it('returns a list of available revisions and the current active one', function() {
        this.timeout(5000);
        return plugin.fetchInitialRevisions(context)
          .then((data) => {
            let revisions = data.initialRevisions.map((d) => d.revision);
            assert.deepEqual(revisions, ['12', '34', '56']);
            assert.isTrue(data.initialRevisions[1].active, 'revision 34 marked current');
          });
      });
    });

    describe('#activate', function() {
      it('takes a manifest file and uploads it to S3', function() {
        this.timeout(5000);

        context.commandOptions = {
          revision: '56'
        };

        return plugin.activate(context)
          .then(() => {
            return get({
              Bucket: process.env.TEST_BUCKET,
              Key: 'fastboot-deploy-info.json'
            });
          })
          .then((data) => {
            let expected = {
              bucket: process.env.TEST_BUCKET,
              key: 'dist-56.zip'
            };
            let actual = JSON.parse(data.Body.toString());

            assert.deepEqual(actual, expected, 'manifest file updated as expected');
          })
          .catch(() => {
            assert.isTrue(false, "can't find manifest-file");
          });
      });
    });
  });
});
