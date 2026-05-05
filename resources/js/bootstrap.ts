import axios from 'axios';
window.axios = axios;

window.axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';

// CSRF token temporarily disabled due to server configuration issues
// const csrfToken = document
// 	.querySelector('meta[name="csrf-token"]')
// 	?.getAttribute('content');

// if (csrfToken) {
// 	window.axios.defaults.headers.common['X-CSRF-TOKEN'] = csrfToken;
// }

window.axios.defaults.withCredentials = true;
