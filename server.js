// ─────────────────────────────────────────────────────────────────
//  server.js — Harlys Residence Hotel Backend
//  Oracle DB via oracledb | Express | PORT 3007
//  Jalankan: node server.js
// ─────────────────────────────────────────────────────────────────

require('dotenv').config();
const express    = require('express');
const oracledb   = require('oracledb');
const cors       = require('cors');

const app  = express();
const PORT = process.env.PORT || 3007;

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

// ─── Konfigurasi Oracle DB (dibaca dari .env) ────────────────────
const DB_CONFIG = {
  user          : process.env.DB_USER,
  password      : process.env.DB_PASSWORD,
  connectString : process.env.DB_CONNECT_STRING,
};

// Gunakan Thin mode (tidak perlu Oracle Client terinstall)
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

async function getConnection() {
  return await oracledb.getConnection(DB_CONFIG);
}

async function closeConnection(conn) {
  if (conn) {
    try { await conn.close(); } catch (e) { console.error('Error closing connection:', e); }
  }
}

// ─── Helper: serialize nilai Oracle (DATE, LOB, dll) ─────────────
function serialize(rows) {
  if (!rows) return rows;
  return rows.map(row => {
    const obj = {};
    for (const [k, v] of Object.entries(row)) {
      if (v instanceof Date) {
        obj[k] = v.toISOString().split('T')[0]; // format YYYY-MM-DD
      } else {
        obj[k] = v;
      }
    }
    return obj;
  });
}

// ─── Health check ─────────────────────────────────────────────────
app.get('/', async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    await conn.execute('SELECT 1 FROM DUAL');
    res.json({ status: 'ok', message: 'Harlys Residence API — Oracle DB terhubung ✓', port: PORT });
  } catch (e) {
    res.status(500).json({ status: 'error', message: 'Koneksi Oracle gagal: ' + e.message });
  } finally {
    await closeConnection(conn);
  }
});


// ═══════════════════════════════════════════════════════════════════
//  DASHBOARD ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

// GET /api/dashboard/statistik
// Return: pendapatan_bulan_ini, kamar { TERISI, TOTAL }, reservasi_aktif, total_tamu
app.get('/api/dashboard/statistik', async (req, res) => {
  let conn;
  try {
    conn = await getConnection();

    // Pendapatan bulan ini (dari PEMBAYARAN LUNAS bulan berjalan)
    const rPend = await conn.execute(`
      SELECT NVL(SUM(jumlah_bayar), 0) AS pendapatan_bulan_ini
      FROM   PEMBAYARAN
      WHERE  status_bayar = 'LUNAS'
      AND    TRUNC(tanggal_bayar, 'MM') = TRUNC(SYSDATE, 'MM')
    `);

    // Statistik kamar
    const rKamar = await conn.execute(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'TERISI'      THEN 1 ELSE 0 END) AS terisi,
        SUM(CASE WHEN status = 'TERSEDIA'    THEN 1 ELSE 0 END) AS tersedia,
        SUM(CASE WHEN status = 'MAINTENANCE' THEN 1 ELSE 0 END) AS maintenance
      FROM KAMAR
    `);

    // Reservasi aktif (PENDING + CONFIRMED + CHECKED_IN)
    const rRes = await conn.execute(`
      SELECT COUNT(*) AS reservasi_aktif
      FROM   RESERVASI
      WHERE  status_reservasi IN ('PENDING', 'CONFIRMED', 'CHECKED_IN')
    `);

    // Total tamu terdaftar
    const rTamu = await conn.execute(`
      SELECT COUNT(*) AS total_tamu FROM GUEST
    `);

    const kamarRow = rKamar.rows[0];
    res.json({
      pendapatan_bulan_ini : rPend.rows[0].PENDAPATAN_BULAN_INI,
      reservasi_aktif      : rRes.rows[0].RESERVASI_AKTIF,
      total_tamu           : rTamu.rows[0].TOTAL_TAMU,
      kamar                : {
        TOTAL      : kamarRow.TOTAL,
        TERISI     : kamarRow.TERISI,
        TERSEDIA   : kamarRow.TERSEDIA,
        MAINTENANCE: kamarRow.MAINTENANCE,
      },
    });
  } catch (e) {
    console.error('/api/dashboard/statistik error:', e);
    res.status(500).json({ error: e.message });
  } finally {
    await closeConnection(conn);
  }
});


// GET /api/dashboard/kamar-terisi
// Return: daftar kamar yang sedang CHECKED_IN hari ini
app.get('/api/dashboard/kamar-terisi', async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(`
      SELECT
        k.nomor_kamar,
        t.nama_tipe,
        g.nama_lengkap,
        r.id_reservasi,
        r.tanggal_check_in,
        r.tanggal_check_out
      FROM KAMAR k
      JOIN DETAIL_RESERVASI d  ON k.id_kamar      = d.id_kamar
      JOIN RESERVASI r         ON d.id_reservasi   = r.id_reservasi
      JOIN GUEST g             ON r.id_guest       = g.id_guest
      JOIN TIPE_KAMAR t        ON k.id_tipe        = t.id_tipe
      WHERE r.status_reservasi = 'CHECKED_IN'
      AND   SYSDATE BETWEEN r.tanggal_check_in AND r.tanggal_check_out
      ORDER BY r.tanggal_check_out
    `);
    res.json(serialize(result.rows));
  } catch (e) {
    console.error('/api/dashboard/kamar-terisi error:', e);
    res.status(500).json({ error: e.message });
  } finally {
    await closeConnection(conn);
  }
});


// GET /api/dashboard/pendapatan
// Return: laporan pendapatan per bulan dari PEMBAYARAN LUNAS
app.get('/api/dashboard/pendapatan', async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(`
      SELECT
        TO_CHAR(p.tanggal_bayar, 'YYYY-MM') AS bulan,
        COUNT(DISTINCT p.id_reservasi)       AS jumlah_reservasi,
        SUM(p.jumlah_bayar)                  AS total_pendapatan
      FROM PEMBAYARAN p
      WHERE p.status_bayar = 'LUNAS'
      GROUP BY TO_CHAR(p.tanggal_bayar, 'YYYY-MM')
      ORDER BY bulan DESC
      FETCH FIRST 12 ROWS ONLY
    `);
    res.json(serialize(result.rows));
  } catch (e) {
    console.error('/api/dashboard/pendapatan error:', e);
    res.status(500).json({ error: e.message });
  } finally {
    await closeConnection(conn);
  }
});


// ═══════════════════════════════════════════════════════════════════
//  GUEST ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

// GET /api/guest/cari?email=xxx
// Cari tamu berdasarkan email
app.get('/api/guest/cari', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Parameter email wajib diisi' });

  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `SELECT id_guest, nama_lengkap, email, no_telepon, no_identitas, kewarganegaraan, tanggal_daftar
       FROM GUEST WHERE LOWER(email) = LOWER(:email)`,
      { email }
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Tamu tidak ditemukan' });
    res.json(serialize(result.rows)[0]);
  } catch (e) {
    console.error('/api/guest/cari error:', e);
    res.status(500).json({ error: e.message });
  } finally {
    await closeConnection(conn);
  }
});


// POST /api/guest
// Daftarkan tamu baru
app.post('/api/guest', async (req, res) => {
  const { nama_lengkap, email, no_telepon, no_identitas, kewarganegaraan } = req.body;
  if (!nama_lengkap || !email) return res.status(400).json({ error: 'nama_lengkap dan email wajib diisi' });

  let conn;
  try {
    conn = await getConnection();

    // Cek apakah email sudah ada
    const cek = await conn.execute(`SELECT id_guest FROM GUEST WHERE LOWER(email) = LOWER(:email)`, { email });
    if (cek.rows.length > 0) {
      return res.json(serialize(
        (await conn.execute(`SELECT * FROM GUEST WHERE LOWER(email) = LOWER(:email)`, { email })).rows
      )[0]);
    }

    const result = await conn.execute(
      `INSERT INTO GUEST (nama_lengkap, email, no_telepon, no_identitas, kewarganegaraan)
       VALUES (:nama_lengkap, :email, :no_telepon, :no_identitas, NVL(:kewarganegaraan, 'Indonesia'))
       RETURNING id_guest INTO :id_guest`,
      {
        nama_lengkap,
        email,
        no_telepon    : no_telepon   || null,
        no_identitas  : no_identitas || null,
        kewarganegaraan: kewarganegaraan || null,
        id_guest      : { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );
    await conn.commit();
    const newId = result.outBinds.id_guest[0];

    const newGuest = await conn.execute(`SELECT * FROM GUEST WHERE id_guest = :id`, { id: newId });
    res.status(201).json(serialize(newGuest.rows)[0]);
  } catch (e) {
    console.error('/api/guest POST error:', e);
    res.status(500).json({ error: e.message });
  } finally {
    await closeConnection(conn);
  }
});


// GET /api/reservasi/guest/:email
// Riwayat reservasi tamu berdasarkan email
app.get('/api/reservasi/guest/:email', async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(`
      SELECT
        r.id_reservasi,
        r.tanggal_check_in,
        r.tanggal_check_out,
        r.status_reservasi,
        NVL(SUM(d.subtotal), 0) AS total_kamar
      FROM RESERVASI r
      JOIN GUEST g              ON r.id_guest    = g.id_guest
      LEFT JOIN DETAIL_RESERVASI d ON r.id_reservasi = d.id_reservasi
      WHERE LOWER(g.email) = LOWER(:email)
      GROUP BY r.id_reservasi, r.tanggal_check_in, r.tanggal_check_out, r.status_reservasi
      ORDER BY r.id_reservasi DESC
    `, { email: req.params.email });
    res.json(serialize(result.rows));
  } catch (e) {
    console.error('/api/reservasi/guest error:', e);
    res.status(500).json({ error: e.message });
  } finally {
    await closeConnection(conn);
  }
});


// ═══════════════════════════════════════════════════════════════════
//  RESERVASI ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

// GET /api/reservasi
// Daftar semua reservasi dengan info lengkap
app.get('/api/reservasi', async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(`
      SELECT
        r.id_reservasi,
        g.nama_lengkap,
        g.email,
        k.nomor_kamar,
        t.nama_tipe,
        r.tanggal_check_in,
        r.tanggal_check_out,
        r.status_reservasi,
        NVL(SUM(d.subtotal), 0) AS total_kamar
      FROM RESERVASI r
      JOIN GUEST g                ON r.id_guest     = g.id_guest
      LEFT JOIN DETAIL_RESERVASI d ON r.id_reservasi = d.id_reservasi
      LEFT JOIN KAMAR k            ON d.id_kamar     = k.id_kamar
      LEFT JOIN TIPE_KAMAR t       ON k.id_tipe      = t.id_tipe
      GROUP BY
        r.id_reservasi, g.nama_lengkap, g.email,
        k.nomor_kamar, t.nama_tipe,
        r.tanggal_check_in, r.tanggal_check_out, r.status_reservasi
      ORDER BY r.id_reservasi DESC
    `);
    res.json(serialize(result.rows));
  } catch (e) {
    console.error('/api/reservasi GET error:', e);
    res.status(500).json({ error: e.message });
  } finally {
    await closeConnection(conn);
  }
});


// POST /api/reservasi
// Buat reservasi baru (termasuk daftar kamar)
// Body: { id_guest, tanggal_check_in, tanggal_check_out, jumlah_tamu, sumber_booking, catatan, kamar_list: [{id_kamar, harga_per_malam}] }
app.post('/api/reservasi', async (req, res) => {
  const { id_guest, tanggal_check_in, tanggal_check_out, jumlah_tamu, sumber_booking, catatan, kamar_list } = req.body;

  if (!id_guest || !tanggal_check_in || !tanggal_check_out) {
    return res.status(400).json({ error: 'id_guest, tanggal_check_in, tanggal_check_out wajib diisi' });
  }
  if (!kamar_list || !kamar_list.length) {
    return res.status(400).json({ error: 'kamar_list tidak boleh kosong' });
  }

  let conn;
  try {
    conn = await getConnection();

    // Hitung total malam
    const ci = new Date(tanggal_check_in);
    const co = new Date(tanggal_check_out);
    const totalMalam = Math.round((co - ci) / (1000 * 60 * 60 * 24));
    if (totalMalam <= 0) return res.status(400).json({ error: 'tanggal_check_out harus setelah tanggal_check_in' });

    // Validasi sumber_booking — daftar yang diizinkan Oracle
    const validSumber = ['LANGSUNG', 'TELEPON', 'AGODA', 'TRAVELOKA', 'TIKET_COM', 'LAINNYA'];
    const sumber = validSumber.includes(sumber_booking) ? sumber_booking : 'LAINNYA';

    // Insert RESERVASI
    const rsvResult = await conn.execute(
      `INSERT INTO RESERVASI
         (id_guest, tanggal_check_in, tanggal_check_out, jumlah_tamu, sumber_booking, catatan)
       VALUES
         (:id_guest, TO_DATE(:ci,'YYYY-MM-DD'), TO_DATE(:co,'YYYY-MM-DD'), :jumlah_tamu, :sumber, :catatan)
       RETURNING id_reservasi INTO :id_reservasi`,
      {
        id_guest,
        ci             : tanggal_check_in,
        co             : tanggal_check_out,
        jumlah_tamu    : jumlah_tamu || 1,
        sumber,
        catatan        : catatan || null,
        id_reservasi   : { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );
    const idReservasi = rsvResult.outBinds.id_reservasi[0];

    // Insert DETAIL_RESERVASI untuk setiap kamar
    for (const kamar of kamar_list) {
      await conn.execute(
        `INSERT INTO DETAIL_RESERVASI (id_reservasi, id_kamar, harga_per_malam, total_malam)
         VALUES (:id_reservasi, :id_kamar, :harga, :malam)`,
        {
          id_reservasi  : idReservasi,
          id_kamar      : kamar.id_kamar,
          harga         : kamar.harga_per_malam,
          malam         : totalMalam,
        }
      );
    }

    await conn.commit();
    res.status(201).json({ success: true, id_reservasi: idReservasi });
  } catch (e) {
    console.error('/api/reservasi POST error:', e);
    if (conn) await conn.rollback().catch(() => {});
    res.status(500).json({ error: e.message });
  } finally {
    await closeConnection(conn);
  }
});


// GET /api/reservasi/:id/tagihan
// Detail tagihan reservasi (kamar + fasilitas + grand total)
app.get('/api/reservasi/:id/tagihan', async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(`
      SELECT
        r.id_reservasi,
        g.nama_lengkap,
        g.email,
        r.tanggal_check_in,
        r.tanggal_check_out,
        r.status_reservasi,
        NVL(SUM(d.subtotal), 0) AS total_kamar,
        NVL(
          (SELECT SUM(f.biaya) FROM FASILITAS f WHERE f.id_reservasi = r.id_reservasi),
          0
        ) AS total_fasilitas,
        NVL(SUM(d.subtotal), 0)
          + NVL(
              (SELECT SUM(f.biaya) FROM FASILITAS f WHERE f.id_reservasi = r.id_reservasi),
              0
            ) AS grand_total
      FROM RESERVASI r
      JOIN GUEST g              ON r.id_guest    = g.id_guest
      LEFT JOIN DETAIL_RESERVASI d ON r.id_reservasi = d.id_reservasi
      WHERE r.id_reservasi = :id
      GROUP BY
        r.id_reservasi, g.nama_lengkap, g.email,
        r.tanggal_check_in, r.tanggal_check_out, r.status_reservasi
    `, { id: parseInt(req.params.id) });

    if (!result.rows.length) return res.status(404).json({ error: 'Reservasi tidak ditemukan' });
    res.json(serialize(result.rows)[0]);
  } catch (e) {
    console.error('/api/reservasi/:id/tagihan error:', e);
    res.status(500).json({ error: e.message });
  } finally {
    await closeConnection(conn);
  }
});


// PATCH /api/reservasi/:id/konfirmasi
app.patch('/api/reservasi/:id/konfirmasi', async (req, res) => {
  await updateStatusReservasi(req, res, 'CONFIRMED');
});

// PATCH /api/reservasi/:id/checkin
app.patch('/api/reservasi/:id/checkin', async (req, res) => {
  await updateStatusReservasi(req, res, 'CHECKED_IN');
  // Trigger TRG_UPDATE_STATUS_KAMAR otomatis mengubah status kamar jadi TERISI
});

// PATCH /api/reservasi/:id/checkout
app.patch('/api/reservasi/:id/checkout', async (req, res) => {
  await updateStatusReservasi(req, res, 'CHECKED_OUT');
  // Trigger otomatis mengubah status kamar jadi TERSEDIA
});

// PATCH /api/reservasi/:id/batal
app.patch('/api/reservasi/:id/batal', async (req, res) => {
  await updateStatusReservasi(req, res, 'CANCELLED');
  // Trigger otomatis mengubah status kamar jadi TERSEDIA
});

async function updateStatusReservasi(req, res, newStatus) {
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `UPDATE RESERVASI SET status_reservasi = :status WHERE id_reservasi = :id`,
      { status: newStatus, id: parseInt(req.params.id) }
    );
    if (result.rowsAffected === 0) return res.status(404).json({ error: 'Reservasi tidak ditemukan' });
    await conn.commit();
    res.json({ success: true, id_reservasi: parseInt(req.params.id), status: newStatus });
  } catch (e) {
    console.error(`PATCH reservasi /${newStatus} error:`, e);
    if (conn) await conn.rollback().catch(() => {});
    res.status(500).json({ error: e.message });
  } finally {
    await closeConnection(conn);
  }
}


// ═══════════════════════════════════════════════════════════════════
//  KAMAR ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

// GET /api/kamar/tersedia?check_in=YYYY-MM-DD&check_out=YYYY-MM-DD
// Kamar yang belum dipesan di periode tersebut
app.get('/api/kamar/tersedia', async (req, res) => {
  const { check_in, check_out } = req.query;
  if (!check_in || !check_out) return res.status(400).json({ error: 'check_in dan check_out wajib diisi' });

  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(`
      SELECT
        k.id_kamar,
        k.nomor_kamar,
        k.lantai,
        t.nama_tipe,
        t.harga_per_malam,
        t.kapasitas
      FROM KAMAR k
      JOIN TIPE_KAMAR t ON k.id_tipe = t.id_tipe
      WHERE k.status = 'TERSEDIA'
      AND k.id_kamar NOT IN (
        SELECT d.id_kamar
        FROM DETAIL_RESERVASI d
        JOIN RESERVASI r ON d.id_reservasi = r.id_reservasi
        WHERE r.status_reservasi IN ('CONFIRMED', 'CHECKED_IN')
        AND NOT (
          r.tanggal_check_out <= TO_DATE(:ci, 'YYYY-MM-DD') OR
          r.tanggal_check_in  >= TO_DATE(:co, 'YYYY-MM-DD')
        )
      )
      ORDER BY t.harga_per_malam, k.nomor_kamar
    `, { ci: check_in, co: check_out });
    res.json(serialize(result.rows));
  } catch (e) {
    console.error('/api/kamar/tersedia error:', e);
    res.status(500).json({ error: e.message });
  } finally {
    await closeConnection(conn);
  }
});


// GET /api/kamar
// Semua kamar dengan status
app.get('/api/kamar', async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(`
      SELECT k.id_kamar, k.nomor_kamar, k.lantai, k.status, k.keterangan,
             t.nama_tipe, t.harga_per_malam, t.kapasitas
      FROM KAMAR k
      JOIN TIPE_KAMAR t ON k.id_tipe = t.id_tipe
      ORDER BY k.nomor_kamar
    `);
    res.json(serialize(result.rows));
  } catch (e) {
    console.error('/api/kamar error:', e);
    res.status(500).json({ error: e.message });
  } finally {
    await closeConnection(conn);
  }
});


// ═══════════════════════════════════════════════════════════════════
//  TIPE KAMAR ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

// GET /api/tipe-kamar
// Daftar semua tipe kamar beserta harga dan kapasitas
app.get('/api/tipe-kamar', async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(`
      SELECT id_tipe, nama_tipe, harga_per_malam, kapasitas, deskripsi
      FROM TIPE_KAMAR
      ORDER BY harga_per_malam
    `);
    res.json(serialize(result.rows));
  } catch (e) {
    console.error('/api/tipe-kamar error:', e);
    res.status(500).json({ error: e.message });
  } finally {
    await closeConnection(conn);
  }
});


// ═══════════════════════════════════════════════════════════════════
//  PEMBAYARAN ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

// POST /api/pembayaran
// Body: { id_reservasi, jumlah_bayar, metode_bayar, status_bayar }
app.post('/api/pembayaran', async (req, res) => {
  const { id_reservasi, jumlah_bayar, metode_bayar, status_bayar } = req.body;
  if (!id_reservasi || !jumlah_bayar || !metode_bayar) {
    return res.status(400).json({ error: 'id_reservasi, jumlah_bayar, dan metode_bayar wajib diisi' });
  }

  let conn;
  try {
    conn = await getConnection();

    // Validasi reservasi ada
    const cekRes = await conn.execute(
      `SELECT id_reservasi, status_reservasi FROM RESERVASI WHERE id_reservasi = :id`,
      { id: parseInt(id_reservasi) }
    );
    if (!cekRes.rows.length) {
      return res.status(404).json({ error: 'Reservasi tidak ditemukan' });
    }

    // Insert pembayaran
    const result = await conn.execute(
      `INSERT INTO PEMBAYARAN (id_reservasi, jumlah_bayar, metode_bayar, status_bayar, tanggal_bayar)
       VALUES (:id_reservasi, :jumlah_bayar, :metode_bayar, :status_bayar, SYSDATE)
       RETURNING id_pembayaran INTO :id_pembayaran`,
      {
        id_reservasi : parseInt(id_reservasi),
        jumlah_bayar : parseFloat(jumlah_bayar),
        metode_bayar : metode_bayar || 'TUNAI',
        status_bayar : status_bayar || 'LUNAS',
        id_pembayaran: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );

    // Jika LUNAS, update status reservasi ke CONFIRMED
    const statusBayar = status_bayar || 'LUNAS';
    if (statusBayar === 'LUNAS') {
      await conn.execute(
        `UPDATE RESERVASI SET status_reservasi = 'CONFIRMED' WHERE id_reservasi = :id AND status_reservasi = 'PENDING'`,
        { id: parseInt(id_reservasi) }
      );
    }

    await conn.commit();
    res.status(201).json({
      success: true,
      id_pembayaran: result.outBinds.id_pembayaran[0],
      id_reservasi: parseInt(id_reservasi),
      status_bayar: statusBayar,
    });
  } catch (e) {
    console.error('/api/pembayaran POST error:', e);
    if (conn) await conn.rollback().catch(() => {});
    res.status(500).json({ error: e.message });
  } finally {
    await closeConnection(conn);
  }
});

// GET /api/pembayaran/:id_reservasi
// Riwayat pembayaran untuk satu reservasi
app.get('/api/pembayaran/:id_reservasi', async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(`
      SELECT id_pembayaran, id_reservasi, jumlah_bayar, metode_bayar, status_bayar, tanggal_bayar
      FROM PEMBAYARAN
      WHERE id_reservasi = :id
      ORDER BY tanggal_bayar DESC
    `, { id: parseInt(req.params.id_reservasi) });
    res.json(serialize(result.rows));
  } catch (e) {
    console.error('/api/pembayaran GET error:', e);
    res.status(500).json({ error: e.message });
  } finally {
    await closeConnection(conn);
  }
});


// ═══════════════════════════════════════════════════════════════════
//  START SERVER
// ═══════════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  Harlys Residence API — PORT ${PORT}           ║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);
  console.log(`  Base URL : http://localhost:${PORT}`);
  console.log(`  Health   : http://localhost:${PORT}/`);
  console.log(`  Stats    : http://localhost:${PORT}/api/dashboard/statistik`);
  console.log(`\n  Pastikan Oracle DB aktif di localhost:1521/XE\n`);
});
