// PixelDrop web client (v2.3.1)
// Shared links are built client-side so existing partner bookmarks keep working.
// The media gateway stores shared paths double-escaped, so decode them twice
// before showing the file name in the UI.
(function () {
  'use strict';

  function decodeLegacyPath(value) {
    try {
      return decodeURIComponent(decodeURIComponent(value));
    } catch (err) {
      return value;
    }
  }

  function buildShareLink(name) {
    return '/download?file=' + encodeURIComponent(name);
  }

  function initLoginForm() {
    var form = document.querySelector('[data-login-form]');
    if (!form) return;
    form.addEventListener('submit', function (event) {
      var email = form.querySelector('input[name="email"]');
      var password = form.querySelector('input[name="password"]');
      if (!email.value || !password.value) {
        event.preventDefault();
        var hint = document.querySelector('[data-login-hint]');
        if (hint) hint.textContent = 'Enter both the email and the password.';
      }
    });
  }

  function initUploadForm() {
    var form = document.querySelector('[data-upload-form]');
    if (!form) return;
    form.addEventListener('submit', function (event) {
      var description = form.querySelector('textarea[name="description"]');
      if (description && description.value.length > 512) {
        event.preventDefault();
        description.setCustomValidity('Keep the description under 512 characters.');
        description.reportValidity();
      }
    });
  }

  function initShareButtons() {
    var buttons = document.querySelectorAll('[data-share]');
    Array.prototype.forEach.call(buttons, function (button) {
      button.addEventListener('click', function () {
        var name = decodeLegacyPath(button.getAttribute('data-share'));
        var link = buildShareLink(name);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(location.origin + link);
        }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initLoginForm();
    initUploadForm();
    initShareButtons();
  });
})();
