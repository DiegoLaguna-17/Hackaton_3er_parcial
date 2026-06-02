const express = require('express');
const { testApi, testDb } = require('../controllers/testController');

const router = express.Router();

router.get('/test', testApi);
router.get('/test-db', testDb);

module.exports = router;
