/* Northwind CRM - dashboard client (local lab build 2.4.1-lab)
 *
 * This bundle is served from /static/app.js. It is intentionally simple; the
 * real dashboard is rendered server-side. It documents the API surface that the
 * browser widgets use, including the avatar proxy.
 */
(function () {
  'use strict';

  var TOKEN_KEY = 'nw_token';

  function storeToken(token) {
    try {
      window.sessionStorage.setItem(TOKEN_KEY, token);
    } catch (error) {
      /* storage can be unavailable in private mode */
    }
  }

  function readToken() {
    try {
      return window.sessionStorage.getItem(TOKEN_KEY);
    } catch (error) {
      return null;
    }
  }

  function apiFetch(path, options) {
    var init = options || {};
    var headers = Object.assign({}, init.headers || {});
    var token = readToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch(path, Object.assign({}, init, { headers: headers })).then(function (response) {
      if (!response.ok) {
        return response.text().then(function (body) {
          throw new Error('GET ' + path + ' failed with HTTP ' + response.status + ': ' + body);
        });
      }
      var contentType = response.headers.get('content-type') || '';
      if (contentType.indexOf('application/json') !== -1) return response.json();
      return response.text();
    });
  }

  function login(email, password) {
    return fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email, password: password }),
    })
      .then(function (response) {
        if (!response.ok) throw new Error('Sign-in failed with HTTP ' + response.status);
        return response.json();
      })
      .then(function (payload) {
        storeToken(payload.token);
        return payload.user;
      });
  }

  function loadProfile() {
    return apiFetch('/api/me');
  }

  function loadInvoices() {
    return apiFetch('/api/invoices');
  }

  function loadInvoice(id) {
    return apiFetch('/api/invoices/' + encodeURIComponent(id));
  }

  /* Avatars are proxied by the backend so the browser never talks to the media
   * host directly. The proxy attaches the internal service credential and then
   * streams the image back. */
  function loadAvatar(url) {
    return apiFetch('/api/avatar?url=' + encodeURIComponent(url));
  }

  function loadAdminFlag() {
    return apiFetch('/api/admin/flag');
  }

  function initials(name) {
    return String(name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (part) {
        return part.charAt(0).toUpperCase();
      })
      .join('');
  }

  document.addEventListener('DOMContentLoaded', function () {
    var avatar = document.querySelector('[data-avatar]');
    if (!avatar) return;
    var url = avatar.getAttribute('data-avatar');
    if (url) {
      loadAvatar(url)
        .then(function (payload) {
          if (typeof payload === 'string') avatar.textContent = payload;
        })
        .catch(function () {
          avatar.textContent = initials(avatar.getAttribute('data-name'));
        });
    } else {
      avatar.textContent = initials(avatar.getAttribute('data-name'));
    }
  });

  window.NorthwindClient = {
    login: login,
    loadProfile: loadProfile,
    loadInvoices: loadInvoices,
    loadInvoice: loadInvoice,
    loadAvatar: loadAvatar,
    loadAdminFlag: loadAdminFlag,
  };
})();
