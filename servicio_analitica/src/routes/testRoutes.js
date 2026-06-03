const express = require('express');
const { testApi, testDb } = require('../controllers/testController');

const router = express.Router();

router.get('/analitica', testApi);
router.get('/analitica/db', testDb);

module.exports = router;
