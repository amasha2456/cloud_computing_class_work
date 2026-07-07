function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c];
  });
}

function formatDateTime(value) {
  var d = new Date(value);
  return isNaN(d.getTime()) ? escapeHtml(value) : d.toLocaleString();
}

function loadPrograms() {
  var container = document.getElementById("programs-list");

  ProgramsAPI.list()
    .then(function (programs) {
      if (!programs || programs.length === 0) {
        container.innerHTML = "<p>No programs have been announced yet.</p>";
        return;
      }

      container.innerHTML = programs
        .map(function (program) {
          return (
            '<div class="col-md-12 col-sm-12">' +
            "<h6>" +
            '<span><i class="fa fa-clock-o"></i> ' +
            formatDateTime(program.datetime) +
            "</span> " +
            '<span><i class="fa fa-tag"></i> ' +
            escapeHtml(program.track) +
            "</span>" +
            "</h6>" +
            "<h3>" +
            escapeHtml(program.sessionname) +
            "</h3>" +
            "<h4>By " +
            escapeHtml(program.speakername) +
            "</h4>" +
            "<p>Duration(in minutes) : " +
            escapeHtml(program.duration) +
            "</p>" +
            '<div class="program-divider col-md-12 col-sm-12"></div>' +
            "</div>"
          );
        })
        .join("");
    })
    .catch(function (err) {
      container.innerHTML =
        "<p>Could not load programs (" + escapeHtml(err.message) + ").</p>";
    });
}

function loadRegisterEvents() {
  var select = document.getElementById("register-event");

  EventsAPI.list()
    .then(function (events) {
      if (!events || events.length === 0) {
        select.innerHTML = '<option value="">No events available</option>';
        return;
      }

      select.innerHTML =
        '<option value="">Select an event</option>' +
        events
          .map(function (event) {
            return (
              '<option value="' +
              escapeHtml(event.eventid) +
              '">' +
              escapeHtml(event.title) +
              " &mdash; " +
              escapeHtml(event.venue) +
              "</option>"
            );
          })
          .join("");
    })
    .catch(function () {
      select.innerHTML = '<option value="">Could not load events</option>';
    });
}

function handleRegisterSubmit(evt) {
  evt.preventDefault();

  var messageBox = document.getElementById("register-message");
  var eventId = document.getElementById("register-event").value;

  if (!eventId) {
    messageBox.innerHTML = '<p class="text-danger">Please select an event.</p>';
    return;
  }

  var payload = {
    registrationId: crypto.randomUUID(),
    eventId: eventId,
    attendeeName: document.getElementById("register-name").value,
    email: document.getElementById("register-email").value,
    ticketcount: Number(document.getElementById("register-ticketcount").value),
    timeStamp: new Date().toISOString(),
  };

  messageBox.innerHTML = "<p>Submitting&hellip;</p>";

  RegistrationsAPI.create(payload)
    .then(function () {
      messageBox.innerHTML =
        '<p class="text-success">Registration successful!</p>';
      document.getElementById("register-form").reset();
      loadRegisterEvents();
    })
    .catch(function (err) {
      messageBox.innerHTML =
        '<p class="text-danger">' + escapeHtml(err.message) + "</p>";
    });
}

document.addEventListener("DOMContentLoaded", function () {
  loadPrograms();
  loadRegisterEvents();
  document
    .getElementById("register-form")
    .addEventListener("submit", handleRegisterSubmit);
});
