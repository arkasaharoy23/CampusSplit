import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const BASE_URL = "http://localhost:5000/api";

async function getIdToken() {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated.");
  return await user.getIdToken();
}

async function request(method, path, body = null) {
  const token = await getIdToken();
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, options);
  const data = await res.json();

  if (!data.success) {
    const err = new Error(data.message || "Request failed.");
    err.status = res.status;
    throw err;
  }

  return data;
}

export const api = {
  get: (path) => request("GET", path),
  post: (path, body) => request("POST", path, body),
  put: (path, body) => request("PUT", path, body),
  delete: (path) => request("DELETE", path),

  auth: {
    register: (data) => api.post("/auth/register", data),
    me: () => api.get("/auth/me"),
    deleteAccount: () => api.delete("/auth/delete-account"),
  },

  users: {
    getProfile: (uid) => api.get(`/users/${uid}`),
    updateProfile: (data) => api.put("/users/me", data),
    searchByEmail: (email) => api.get(`/users/search?email=${encodeURIComponent(email)}`),
  },

  groups: {
    getAll: () => api.get("/groups"),
    get: (groupId) => api.get(`/groups/${groupId}`),
    create: (data) => api.post("/groups", data),
    update: (groupId, data) => api.put(`/groups/${groupId}`, data),
    delete: (groupId) => api.delete(`/groups/${groupId}`),
    addMember: (groupId, email) => api.post(`/groups/${groupId}/members`, { email }),
    removeMember: (groupId, memberId) => api.delete(`/groups/${groupId}/members/${memberId}`),
    joinByCode: (code) => api.get(`/groups/join/${code}`),
  },

  expenses: {
    add: (data) => api.post("/expenses", data),
    getByGroup: (groupId) => api.get(`/expenses/group/${groupId}`),
    delete: (expenseId) => api.delete(`/expenses/${expenseId}`),
  },

  settlements: {
    settleUp: (data) => api.post("/settlements", data),
    getMine: () => api.get("/settlements/me"),
    getByGroup: (groupId) => api.get(`/settlements/group/${groupId}`),
    getSuggestions: (groupId) => api.get(`/settlements/group/${groupId}/suggestions`),
  },

  analytics: {
    me: () => api.get("/analytics/me"),
    group: (groupId) => api.get(`/analytics/group/${groupId}`),
  },

  notifications: {
    getAll: () => api.get("/notifications"),
    markRead: (ids) => api.put("/notifications/read", { ids }),
    markAllRead: () => api.put("/notifications/read-all"),
    delete: (notifId) => api.delete(`/notifications/${notifId}`),
  },
};