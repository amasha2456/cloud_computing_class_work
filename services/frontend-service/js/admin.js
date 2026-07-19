Auth.requireLogin();

var eventsCache = [];
var programsCache = [];
var registrationsCache = [];

function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function formatDateTime(value) {
  var d = new Date(value);
  return isNaN(d.getTime()) ? escapeHtml(value) : d.toLocaleString();
}

function toDatetimeLocalValue(value) {
  var d = new Date(value);
  if (isNaN(d.getTime())) return "";
  var pad = function (n) {
    return String(n).padStart(2, "0");
  };
  return (
    d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
    "T" + pad(d.getHours()) + ":" + pad(d.getMinutes())
  );
}

function showAlert(containerId, type, message) {
  var el = document.getElementById(containerId);
  el.innerHTML = '<p class="alert alert-' + type + '">' + escapeHtml(message) + "</p>";
  setTimeout(function () {
    el.innerHTML = "";
  }, 4000);
}

function bindRowActions(tbody, selector, handler) {
  tbody.querySelectorAll(selector).forEach(function (btn) {
    btn.addEventListener("click", function () {
      handler(btn.getAttribute("data-id"));
    });
  });
}

/* ========================= EVENTS ========================= */

function renderEventsTable() {
  var tbody = document.getElementById("events-table-body");
  if (!eventsCache.length) {
    tbody.innerHTML = '<tr><td colspan="7">No events yet.</td></tr>';
    return;
  }

  tbody.innerHTML = eventsCache
    .map(function (e) {
      return (
        "<tr>" +
        "<td>" + escapeHtml(e.title) + "</td>" +
        "<td>" + escapeHtml(e.venue) + "</td>" +
        "<td>" + formatDateTime(e.datetime) + "</td>" +
        "<td>" + escapeHtml(e.ticketprice) + "</td>" +
        "<td>" + escapeHtml(e.capacity) + "</td>" +
        "<td>" + escapeHtml(e.seatsavailable) + "</td>" +
        "<td>" +
        '<button class="btn btn-xs btn-default event-edit-btn" data-id="' + escapeHtml(e.eventid) + '">Edit</button> ' +
        '<button class="btn btn-xs btn-danger event-delete-btn" data-id="' + escapeHtml(e.eventid) + '">Delete</button>' +
        "</td>" +
        "</tr>"
      );
    })
    .join("");

  bindRowActions(tbody, ".event-edit-btn", openEditEvent);
  bindRowActions(tbody, ".event-delete-btn", deleteEvent);
}

function populateEventSelect() {
  var select = document.getElementById("registration-eventid");
  if (!eventsCache.length) {
    select.innerHTML = '<option value="">No events available</option>';
    return;
  }
  select.innerHTML = eventsCache
    .map(function (e) {
      return '<option value="' + escapeHtml(e.eventid) + '">' + escapeHtml(e.title) + "</option>";
    })
    .join("");
}

function loadEvents() {
  return EventsAPI.list()
    .then(function (events) {
      eventsCache = events || [];
      renderEventsTable();
      populateEventSelect();
      renderRegistrationsTable();
    })
    .catch(function (err) {
      showAlert("events-alert", "danger", err.message);
    });
}

function openAddEvent() {
  document.getElementById("event-form").reset();
  document.getElementById("event-id").value = "";
  document.getElementById("event-modal-title").textContent = "Add Event";
  $("#event-modal").modal("show");
}

function openEditEvent(eventId) {
  var e = eventsCache.find(function (x) {
    return x.eventid === eventId;
  });
  if (!e) return;

  document.getElementById("event-id").value = e.eventid;
  document.getElementById("event-title").value = e.title;
  document.getElementById("event-venue").value = e.venue;
  document.getElementById("event-datetime").value = toDatetimeLocalValue(e.datetime);
  document.getElementById("event-ticketprice").value = e.ticketprice;
  document.getElementById("event-capacity").value = e.capacity;
  document.getElementById("event-seatsavailable").value = e.seatsavailable;
  document.getElementById("event-modal-title").textContent = "Edit Event";
  $("#event-modal").modal("show");
}

function submitEventForm(evt) {
  evt.preventDefault();

  var existingId = document.getElementById("event-id").value;
  var id = existingId || crypto.randomUUID();
  var payload = {
    eventId: id,
    title: document.getElementById("event-title").value,
    venue: document.getElementById("event-venue").value,
    dateTime: new Date(document.getElementById("event-datetime").value).toISOString(),
    ticketPrice: Number(document.getElementById("event-ticketprice").value),
    capacity: Number(document.getElementById("event-capacity").value),
    seatsAvailable: Number(document.getElementById("event-seatsavailable").value),
  };

  var action = existingId ? EventsAPI.update(id, payload) : EventsAPI.create(payload);
  action
    .then(function () {
      $("#event-modal").modal("hide");
      showAlert("events-alert", "success", existingId ? "Event updated." : "Event created.");
      loadEvents();
    })
    .catch(function (err) {
      showAlert("events-alert", "danger", err.message);
    });
}

function deleteEvent(eventId) {
  if (!confirm("Delete this event?")) return;
  EventsAPI.remove(eventId)
    .then(function () {
      showAlert("events-alert", "success", "Event deleted.");
      loadEvents();
    })
    .catch(function (err) {
      showAlert("events-alert", "danger", err.message);
    });
}

/* ========================= PROGRAMS ========================= */

function renderProgramsTable() {
  var tbody = document.getElementById("programs-table-body");
  if (!programsCache.length) {
    tbody.innerHTML = '<tr><td colspan="6">No programs yet.</td></tr>';
    return;
  }

  tbody.innerHTML = programsCache
    .map(function (p) {
      return (
        "<tr>" +
        "<td>" + escapeHtml(p.sessionname) + "</td>" +
        "<td>" + escapeHtml(p.track) + "</td>" +
        "<td>" + escapeHtml(p.speakername) + "</td>" +
        "<td>" + formatDateTime(p.datetime) + "</td>" +
        "<td>" + escapeHtml(p.duration) + "</td>" +
        "<td>" +
        '<button class="btn btn-xs btn-default program-edit-btn" data-id="' + escapeHtml(p.programid) + '">Edit</button> ' +
        '<button class="btn btn-xs btn-danger program-delete-btn" data-id="' + escapeHtml(p.programid) + '">Delete</button>' +
        "</td>" +
        "</tr>"
      );
    })
    .join("");

  bindRowActions(tbody, ".program-edit-btn", openEditProgram);
  bindRowActions(tbody, ".program-delete-btn", deleteProgram);
}

function loadPrograms() {
  return ProgramsAPI.list()
    .then(function (programs) {
      programsCache = programs || [];
      renderProgramsTable();
    })
    .catch(function (err) {
      showAlert("programs-alert", "danger", err.message);
    });
}

function openAddProgram() {
  document.getElementById("program-form").reset();
  document.getElementById("program-id").value = "";
  document.getElementById("program-modal-title").textContent = "Add Program";
  $("#program-modal").modal("show");
}

function openEditProgram(programId) {
  var p = programsCache.find(function (x) {
    return x.programid === programId;
  });
  if (!p) return;

  document.getElementById("program-id").value = p.programid;
  document.getElementById("program-sessionname").value = p.sessionname;
  document.getElementById("program-track").value = p.track;
  document.getElementById("program-speakername").value = p.speakername;
  document.getElementById("program-datetime").value = toDatetimeLocalValue(p.datetime);
  document.getElementById("program-duration").value = p.duration;
  document.getElementById("program-modal-title").textContent = "Edit Program";
  $("#program-modal").modal("show");
}

function submitProgramForm(evt) {
  evt.preventDefault();

  var existingId = document.getElementById("program-id").value;
  var id = existingId || crypto.randomUUID();
  var payload = {
    programId: id,
    sessionName: document.getElementById("program-sessionname").value,
    track: document.getElementById("program-track").value,
    speakerName: document.getElementById("program-speakername").value,
    dateTime: new Date(document.getElementById("program-datetime").value).toISOString(),
    duration: document.getElementById("program-duration").value,
  };

  var action = existingId ? ProgramsAPI.update(id, payload) : ProgramsAPI.create(payload);
  action
    .then(function () {
      $("#program-modal").modal("hide");
      showAlert("programs-alert", "success", existingId ? "Program updated." : "Program created.");
      loadPrograms();
    })
    .catch(function (err) {
      showAlert("programs-alert", "danger", err.message);
    });
}

function deleteProgram(programId) {
  if (!confirm("Delete this program?")) return;
  ProgramsAPI.remove(programId)
    .then(function () {
      showAlert("programs-alert", "success", "Program deleted.");
      loadPrograms();
    })
    .catch(function (err) {
      showAlert("programs-alert", "danger", err.message);
    });
}

/* ========================= REGISTRATIONS ========================= */

function eventLabel(eventId) {
  var e = eventsCache.find(function (x) {
    return x.eventid === eventId;
  });
  return e ? e.title : eventId;
}

function renderRegistrationsTable() {
  var tbody = document.getElementById("registrations-table-body");
  if (!registrationsCache.length) {
    tbody.innerHTML = '<tr><td colspan="6">No registrations yet.</td></tr>';
    return;
  }

  tbody.innerHTML = registrationsCache
    .map(function (r) {
      return (
        "<tr>" +
        "<td>" + escapeHtml(eventLabel(r.eventid)) + "</td>" +
        "<td>" + escapeHtml(r.attendeename) + "</td>" +
        "<td>" + escapeHtml(r.email) + "</td>" +
        "<td>" + escapeHtml(r.ticketcount) + "</td>" +
        "<td>" + formatDateTime(r.timestamp) + "</td>" +
        "<td>" +
        '<button class="btn btn-xs btn-default registration-edit-btn" data-id="' + escapeHtml(r.registrationid) + '">Edit</button> ' +
        '<button class="btn btn-xs btn-danger registration-delete-btn" data-id="' + escapeHtml(r.registrationid) + '">Delete</button>' +
        "</td>" +
        "</tr>"
      );
    })
    .join("");

  bindRowActions(tbody, ".registration-edit-btn", openEditRegistration);
  bindRowActions(tbody, ".registration-delete-btn", deleteRegistration);
}

function loadRegistrations() {
  return RegistrationsAPI.list()
    .then(function (registrations) {
      registrationsCache = registrations || [];
      renderRegistrationsTable();
    })
    .catch(function (err) {
      showAlert("registrations-alert", "danger", err.message);
    });
}

function openAddRegistration() {
  document.getElementById("registration-form").reset();
  document.getElementById("registration-id").value = "";
  document.getElementById("registration-modal-title").textContent = "Add Registration";
  $("#registration-modal").modal("show");
}

function openEditRegistration(registrationId) {
  var r = registrationsCache.find(function (x) {
    return x.registrationid === registrationId;
  });
  if (!r) return;

  document.getElementById("registration-id").value = r.registrationid;
  document.getElementById("registration-eventid").value = r.eventid;
  document.getElementById("registration-attendeename").value = r.attendeename;
  document.getElementById("registration-email").value = r.email;
  document.getElementById("registration-ticketcount").value = r.ticketcount;
  document.getElementById("registration-modal-title").textContent = "Edit Registration";
  $("#registration-modal").modal("show");
}

function submitRegistrationForm(evt) {
  evt.preventDefault();

  var existingId = document.getElementById("registration-id").value;
  var id = existingId || crypto.randomUUID();
  var payload = {
    registrationId: id,
    eventId: document.getElementById("registration-eventid").value,
    attendeeName: document.getElementById("registration-attendeename").value,
    email: document.getElementById("registration-email").value,
    ticketcount: Number(document.getElementById("registration-ticketcount").value),
    timeStamp: new Date().toISOString(),
  };

  if (!payload.eventId) {
    showAlert("registrations-alert", "danger", "Please select an event.");
    return;
  }

  var action = existingId
    ? RegistrationsAPI.update(id, payload)
    : RegistrationsAPI.create(payload);

  action
    .then(function () {
      $("#registration-modal").modal("hide");
      showAlert(
        "registrations-alert",
        "success",
        existingId ? "Registration updated." : "Registration created.",
      );
      loadRegistrations();
    })
    .catch(function (err) {
      showAlert("registrations-alert", "danger", err.message);
    });
}

function deleteRegistration(registrationId) {
  if (!confirm("Delete this registration?")) return;
  RegistrationsAPI.remove(registrationId)
    .then(function () {
      showAlert("registrations-alert", "success", "Registration deleted.");
      loadRegistrations();
    })
    .catch(function (err) {
      showAlert("registrations-alert", "danger", err.message);
    });
}

/* ========================= INIT ========================= */

document.addEventListener("DOMContentLoaded", function () {
  loadEvents().then(loadRegistrations);
  loadPrograms();

  document.getElementById("event-add-btn").addEventListener("click", openAddEvent);
  document.getElementById("program-add-btn").addEventListener("click", openAddProgram);
  document.getElementById("registration-add-btn").addEventListener("click", openAddRegistration);

  document.getElementById("event-form").addEventListener("submit", submitEventForm);
  document.getElementById("program-form").addEventListener("submit", submitProgramForm);
  document.getElementById("registration-form").addEventListener("submit", submitRegistrationForm);

  document.getElementById("logout-link").addEventListener("click", function (evt) {
    evt.preventDefault();
    Auth.logout();
  });
});
