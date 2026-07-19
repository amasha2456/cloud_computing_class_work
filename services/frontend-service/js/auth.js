var Auth = {
  TOKEN_KEY: "admin_token",

  getToken: function () {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  setToken: function (token) {
    localStorage.setItem(this.TOKEN_KEY, token);
  },

  clearToken: function () {
    localStorage.removeItem(this.TOKEN_KEY);
  },

  isLoggedIn: function () {
    return !!this.getToken();
  },

  requireLogin: function () {
    if (!this.isLoggedIn()) {
      window.location.href = "login.html";
    }
  },

  logout: function () {
    this.clearToken();
    window.location.href = "login.html";
  },
};
