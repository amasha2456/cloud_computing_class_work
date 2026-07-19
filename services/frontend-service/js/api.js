function generateUUID() {
  if (window.crypto && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // crypto.randomUUID is only available in secure contexts (HTTPS or
  // localhost) - fall back to Math.random for plain-HTTP deployments.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0;
    var v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function request(url, options) {
  options = options || {};
  var headers = options.body ? { "Content-Type": "application/json" } : {};
  var token = typeof Auth !== "undefined" ? Auth.getToken() : null;
  if (token) {
    headers["Authorization"] = "Bearer " + token;
  }

  var res = await fetch(url, {
    method: options.method || "GET",
    headers: headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  var data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }

  if (res.status === 401 && typeof Auth !== "undefined") {
    Auth.clearToken();
    if (window.location.pathname.indexOf("admin.html") !== -1) {
      window.location.href = "login.html";
    }
  }

  if (!res.ok) {
    throw new Error((data && data.message) || "Request failed (" + res.status + ")");
  }

  return data;
}

var AuthAPI = {
  login: function (username, password) {
    return request(API_BASE.auth + "/auth/login", {
      method: "POST",
      body: { username: username, password: password },
    });
  },
};

var EventsAPI = {
  list: function () {
    return request(API_BASE.event + "/event/allEvent");
  },
  get: function (eventId) {
    return request(API_BASE.event + "/event/get/" + encodeURIComponent(eventId));
  },
  create: function (payload) {
    return request(API_BASE.event + "/event/create", { method: "POST", body: payload });
  },
  update: function (eventId, payload) {
    return request(API_BASE.event + "/event/update/" + encodeURIComponent(eventId), {
      method: "PUT",
      body: payload,
    });
  },
  remove: function (eventId) {
    return request(API_BASE.event + "/event/delete/" + encodeURIComponent(eventId), {
      method: "DELETE",
    });
  },
};

var ProgramsAPI = {
  list: function () {
    return request(API_BASE.program + "/program/getAllProgram");
  },
  get: function (programId) {
    return request(API_BASE.program + "/program/getProgram/" + encodeURIComponent(programId));
  },
  create: function (payload) {
    return request(API_BASE.program + "/program/createProgram", {
      method: "POST",
      body: payload,
    });
  },
  update: function (programId, payload) {
    return request(
      API_BASE.program + "/program/updateProgramDetails/" + encodeURIComponent(programId),
      { method: "PUT", body: payload },
    );
  },
  remove: function (programId) {
    return request(
      API_BASE.program + "/program/deleteProgram/" + encodeURIComponent(programId),
      { method: "DELETE" },
    );
  },
};

var RegistrationsAPI = {
  list: function () {
    return request(API_BASE.registration + "/registration/getAllRegistration");
  },
  get: function (registrationId) {
    return request(
      API_BASE.registration + "/registration/getRegistration/" + encodeURIComponent(registrationId),
    );
  },
  create: function (payload) {
    return request(API_BASE.registration + "/registration/createRegistration", {
      method: "POST",
      body: payload,
    });
  },
  update: function (registrationId, payload) {
    return request(
      API_BASE.registration + "/registration/updateRegistration/" + encodeURIComponent(registrationId),
      { method: "PUT", body: payload },
    );
  },
  remove: function (registrationId) {
    return request(
      API_BASE.registration + "/registration/deleteRegistration/" + encodeURIComponent(registrationId),
      { method: "DELETE" },
    );
  },
};
