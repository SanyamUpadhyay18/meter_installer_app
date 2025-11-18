// const express = require('express');
// const cors = require('cors');
// const { Pool } = require('pg');
// require('dotenv').config();

// const app = express();
// const PORT = process.env.PORT || 5000;

// app.use(cors());
// app.use(express.json());

// const pool = new Pool({
//   user: process.env.DB_USER || 'postgres',
//   host: process.env.DB_HOST || 'localhost',
//   database: process.env.DB_NAME || 'meter_kit_installer',
//   password: process.env.DB_PASSWORD,
//   port: process.env.DB_PORT || 5432,
// });

// pool.connect((err, client, release) => {
//   if (err) {
//     console.error('Error connecting to database:', err.stack);
//   } else {
//     console.log('✅ Database connected successfully');
//     release();
//   }
// });

// app.post('/api/installations', async (req, res) => {
//   const client = await pool.connect();
  
//   try {
//     await client.query('BEGIN');
//     const { substationData, lvFeeders, installerName } = req.body;
//     const [subLat, subLon] = substationData.gisLocation.split(',').map(coord => parseFloat(coord.trim()));

//     const substationQuery = `
//       INSERT INTO substations (
//         gss, mv_feeder, gis_location, latitude, longitude, 
//         dt_name, mkit_serial_no, installer_name
//       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
//       RETURNING id, mkit_serial_no
//     `;

//     const substationValues = [
//       substationData.gss,
//       substationData.mvFeeder,
//       substationData.gisLocation,
//       subLat,
//       subLon,
//       substationData.dtName,
//       substationData.mKitSerialNo,
//       installerName || 'Unknown'
//     ];

//     const substationResult = await client.query(substationQuery, substationValues);
//     const substationId = substationResult.rows[0].id;
//     const mkitSerialNo = substationResult.rows[0].mkit_serial_no;

//     const lvFeederPromises = lvFeeders.map((feeder, index) => {
//       const [lat, lon] = feeder.gisLocation.split(',').map(coord => parseFloat(coord.trim()));

//       const lvFeederQuery = `
//         INSERT INTO lv_feeders (
//           substation_id, mkit_serial_no, feeder_number, 
//           feeder_name, ampacity, gis_location, latitude, longitude
//         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
//         RETURNING id
//       `;

//       return client.query(lvFeederQuery, [
//         substationId, mkitSerialNo, index + 1,
//         feeder.name, feeder.ampacity, feeder.gisLocation, lat, lon
//       ]);
//     });

//     await Promise.all(lvFeederPromises);
//     await client.query('COMMIT');

//     res.status(201).json({
//       success: true,
//       message: 'Installation data saved successfully!',
//       data: { substationId, mkitSerialNo, totalLVFeeders: lvFeeders.length }
//     });

//   } catch (error) {
//     await client.query('ROLLBACK');
//     console.error('Error saving installation:', error);
    
//     if (error.code === '23505') {
//       res.status(400).json({ success: false, message: 'M.Kit Serial Number already exists!' });
//     } else {
//       res.status(500).json({ success: false, message: 'Error saving installation data', error: error.message });
//     }
//   } finally {
//     client.release();
//   }
// });

// app.get('/api/installations', async (req, res) => {
//   try {
//     const query = `SELECT * FROM installation_complete_view ORDER BY installation_date DESC`;
//     const result = await pool.query(query);
//     res.status(200).json({ success: true, count: result.rows.length, data: result.rows });
//   } catch (error) {
//     console.error('Error fetching installations:', error);
//     res.status(500).json({ success: false, message: 'Error fetching installation data', error: error.message });
//   }
// });

// app.get('/api/installations/:serialNo', async (req, res) => {
//   try {
//     const { serialNo } = req.params;
//     const query = `SELECT * FROM installation_complete_view WHERE mkit_serial_no = $1`;
//     const result = await pool.query(query, [serialNo]);

//     if (result.rows.length === 0) {
//       return res.status(404).json({ success: false, message: 'Installation not found' });
//     }

//     res.status(200).json({ success: true, data: result.rows[0] });
//   } catch (error) {
//     console.error('Error fetching installation:', error);
//     res.status(500).json({ success: false, message: 'Error fetching installation data', error: error.message });
//   }
// });

// app.get('/api/installations/search/:keyword', async (req, res) => {
//   try {
//     const { keyword } = req.params;
//     const query = `
//       SELECT * FROM installation_complete_view
//       WHERE gss ILIKE $1 OR mv_feeder ILIKE $1 OR dt_name ILIKE $1 OR mkit_serial_no ILIKE $1 OR installer_name ILIKE $1
//       ORDER BY installation_date DESC
//     `;
//     const result = await pool.query(query, [`%${keyword}%`]);
//     res.status(200).json({ success: true, count: result.rows.length, data: result.rows });
//   } catch (error) {
//     console.error('Error searching installations:', error);
//     res.status(500).json({ success: false, message: 'Error searching installations', error: error.message });
//   }
// });

// app.patch('/api/installations/:serialNo/status', async (req, res) => {
//   try {
//     const { serialNo } = req.params;
//     const { status } = req.body;
//     const query = `UPDATE substations SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE mkit_serial_no = $2 RETURNING *`;
//     const result = await pool.query(query, [status, serialNo]);

//     if (result.rows.length === 0) {
//       return res.status(404).json({ success: false, message: 'Installation not found' });
//     }

//     res.status(200).json({ success: true, message: 'Status updated successfully', data: result.rows[0] });
//   } catch (error) {
//     console.error('Error updating status:', error);
//     res.status(500).json({ success: false, message: 'Error updating status', error: error.message });
//   }
// });

// app.get('/api/statistics', async (req, res) => {
//   try {
//     const query = `
//       SELECT 
//         COUNT(DISTINCT s.id) as total_installations,
//         COUNT(DISTINCT CASE WHEN s.status = 'Active' THEN s.id END) as active_installations,
//         COUNT(lf.id) as total_lv_feeders,
//         COUNT(DISTINCT s.installer_name) as total_installers,
//         COUNT(DISTINCT s.gss) as unique_gss_locations
//       FROM substations s
//       LEFT JOIN lv_feeders lf ON s.id = lf.substation_id
//     `;
//     const result = await pool.query(query);
//     res.status(200).json({ success: true, data: result.rows[0] });
//   } catch (error) {
//     console.error('Error fetching statistics:', error);
//     res.status(500).json({ success: false, message: 'Error fetching statistics', error: error.message });
//   }
// });

// app.get('/api/health', (req, res) => {
//   res.status(200).json({ status: 'OK', message: 'Server is running' });
// });

// app.listen(PORT, () => {
//   console.log(`🚀 Server running on http://localhost:${PORT}`);
// });

// process.on('SIGINT', async () => {
//   console.log('\n⏳ Shutting down gracefully...');
//   await pool.end();
//   process.exit(0);
// });
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { authenticateToken } = require('./middleware/auth');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || 'localhost';

app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'meter_kit_installer',
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to database:', err.stack);
  } else {
    console.log('✅ Database connected successfully');
    release();
  }
});

// Auth Routes (No authentication required)
const authRoutes = require('./routes/auth')(pool);
app.use('/api/auth', authRoutes);

// Protected Routes (Authentication required)
app.post('/api/installations', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const { substationData, lvFeeders } = req.body;
    const installerName = req.user.username; // Get from JWT token
    const userId = req.user.id; // Get from JWT token
    
    const [subLat, subLon] = substationData.gisLocation.split(',').map(coord => parseFloat(coord.trim()));

    const substationQuery = `
      INSERT INTO substations (
        gss, mv_feeder, gis_location, latitude, longitude, 
        dt_name, mkit_serial_no, installer_name, user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, mkit_serial_no
    `;

    const substationValues = [
      substationData.gss,
      substationData.mvFeeder,
      substationData.gisLocation,
      subLat,
      subLon,
      substationData.dtName,
      substationData.mKitSerialNo,
      installerName,
      userId
    ];

    const substationResult = await client.query(substationQuery, substationValues);
    const substationId = substationResult.rows[0].id;
    const mkitSerialNo = substationResult.rows[0].mkit_serial_no;

    const lvFeederPromises = lvFeeders.map((feeder, index) => {
      const [lat, lon] = feeder.gisLocation.split(',').map(coord => parseFloat(coord.trim()));

      const lvFeederQuery = `
        INSERT INTO lv_feeders (
          substation_id, mkit_serial_no, feeder_number, 
          feeder_name, ampacity, gis_location, latitude, longitude
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `;

      return client.query(lvFeederQuery, [
        substationId, mkitSerialNo, index + 1,
        feeder.name, feeder.ampacity, feeder.gisLocation, lat, lon
      ]);
    });

    await Promise.all(lvFeederPromises);
    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Installation data saved successfully!',
      data: { substationId, mkitSerialNo, totalLVFeeders: lvFeeders.length }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving installation:', error);
    
    if (error.code === '23505') {
      res.status(400).json({ success: false, message: 'M.Kit Serial Number already exists!' });
    } else {
      res.status(500).json({ success: false, message: 'Error saving installation data', error: error.message });
    }
  } finally {
    client.release();
  }
});

app.get('/api/installations', authenticateToken, async (req, res) => {
  try {
    const query = `SELECT * FROM installation_complete_view ORDER BY installation_date DESC`;
    const result = await pool.query(query);
    res.status(200).json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    console.error('Error fetching installations:', error);
    res.status(500).json({ success: false, message: 'Error fetching installation data', error: error.message });
  }
});

app.get('/api/installations/:serialNo', authenticateToken, async (req, res) => {
  try {
    const { serialNo } = req.params;
    const query = `SELECT * FROM installation_complete_view WHERE mkit_serial_no = $1`;
    const result = await pool.query(query, [serialNo]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Installation not found' });
    }

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error fetching installation:', error);
    res.status(500).json({ success: false, message: 'Error fetching installation data', error: error.message });
  }
});

app.get('/api/installations/search/:keyword', authenticateToken, async (req, res) => {
  try {
    const { keyword } = req.params;
    const query = `
      SELECT * FROM installation_complete_view
      WHERE gss ILIKE $1 OR mv_feeder ILIKE $1 OR dt_name ILIKE $1 OR mkit_serial_no ILIKE $1 OR installer_name ILIKE $1
      ORDER BY installation_date DESC
    `;
    const result = await pool.query(query, [`%${keyword}%`]);
    res.status(200).json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error) {
    console.error('Error searching installations:', error);
    res.status(500).json({ success: false, message: 'Error searching installations', error: error.message });
  }
});

app.patch('/api/installations/:serialNo/status', authenticateToken, async (req, res) => {
  try {
    const { serialNo } = req.params;
    const { status } = req.body;
    const query = `UPDATE substations SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE mkit_serial_no = $2 RETURNING *`;
    const result = await pool.query(query, [status, serialNo]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Installation not found' });
    }

    res.status(200).json({ success: true, message: 'Status updated successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ success: false, message: 'Error updating status', error: error.message });
  }
});

app.get('/api/statistics', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT 
        COUNT(DISTINCT s.id) as total_installations,
        COUNT(DISTINCT CASE WHEN s.status = 'Active' THEN s.id END) as active_installations,
        COUNT(lf.id) as total_lv_feeders,
        COUNT(DISTINCT s.installer_name) as total_installers,
        COUNT(DISTINCT s.gss) as unique_gss_locations
      FROM substations s
      LEFT JOIN lv_feeders lf ON s.id = lf.substation_id
    `;
    const result = await pool.query(query);
    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ success: false, message: 'Error fetching statistics', error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

app.listen(PORT, () => {
  console.log(` Server running on http://${HOST}:${PORT}`);
});

process.on('SIGINT', async () => {
  console.log('\n⏳ Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});