require('isomorphic-fetch');
const { accept, createFetch, createStack, header, init } = require('http-client');
const { find, cloneDeep, omit } = require('lodash');
const queryString = require('query-string');

const noop = () => null;
let log = noop;

const defaultHeaders = {
  'Content-Type': 'application/json'
}

function getSHA(file) {
  const shasum = crypto.createHash('sha1');
  shasum.update(file);
  return shasum.digest('hex');
}

const errorCheck = opts => (response) => {
  log(`errorCheck = (${response})`);
  if (!response.ok) {
    const error = new Error(`Unable to fetch. ${response.status} ${response.statusCode}`);
    error.status = response.status;
    return Promise.reject(error);
  }
  if (opts.accept === 'application/json') { return response.json(); }
  return response.text();
};

/**
 *   returns fetch promise
 *   params:
 *   two strings,
 *   OR Object with:
 *   method: 'GET'
 *   path: '/listAllUsers'
 *   query: { key: value }
 *   body: { key: value } || { name: string, content: buffer }
 *   headers: { key: value }
 */
const api = opts => async (methodOrOpts, path, body) => {
  let method
  let query;
  let headers;
  if (typeof methodOrOpts === 'string') {
    method = methodOrOpts
  } else {
    method = methodOrOpts.method
    query = methodOrOpts.query
    body = methodOrOpts.body
    headers = methodOrOpts.headers
    path = methodOrOpts.path
  }
  log(`api`, {method, path, query, body, host: opts.host, url: opts.url});
  if (query) {
    if (typeof query !== 'string') {
      query = queryString.stringify(query);
    }
    query = `?${query}`
  }
  const endpoint = opts.url || `${opts.host || ''}/${path || ''}${query || ''}`;
  log('endpoint', endpoint)
  const fetchOpts = { method };
  const createFetchParams = [opts.fetchStack];
  const requestHeaders = headers || {};
  if (method !== 'GET' && body) {
    if (body.hasOwnProperty('name') && body.hasOwnProperty('content')) {
      requestHeaders['Content-Type'] = 'application/octet-stream';
      requestHeaders['Content-Length'] = body.content.length;
      if (opts.nowHeaders) {
        requestHeaders['x-now-digest'] = getSHA(body.content);
        requestHeaders['x-now-size'] = body.content.length;
      }
      fetchOpts.body = body.content;
    } else {
      requestHeaders['Content-Type'] = 'application/json';
      fetchOpts.body = JSON.stringify(body);
    }
  }
  for (const key in requestHeaders) {
    if (requestHeaders[key]) {
      const value = requestHeaders[key];
      createFetchParams.push(header(key, value))
    }
  }
  const thisFetch = createFetch.apply(createFetch, createFetchParams)
  return thisFetch(endpoint, fetchOpts).then(opts.errorHandler);
};
/**
 *   returns api (defined above)
 *   params:
 *   agent = HttpsProxyAgent config
 *   accept = 'json' || accept header string
 *   headers = { key: value }
 *   host = 'https://example.com/v2'
 */
module.exports = (opts) => {
  if (process.env.DEBUG === 'fetchapi') { log = console.log; } else { log = noop }
  if (process.env.PROXY_REQUESTS) {
    const HttpsProxyAgent = require('https-proxy-agent');
    opts.proxyagent = new HttpsProxyAgent(opts.agent);
  }
  let fetch;
  if (!opts.accept || opts.accept === 'json') { opts.accept = 'application/json' };
  const headers = Object.assign({}, defaultHeaders, opts.headers)
  const fetchOpts = [accept(opts.accept)]
  for (const key in headers) {
    if (headers[key]) {
      const value = headers[key];
      fetchOpts.push(header(key, value))
    }
  }
  opts.fetchStack = createStack.apply(createStack, fetchOpts);
  opts.errorHandler = errorCheck(opts)
  return api(opts)
}
