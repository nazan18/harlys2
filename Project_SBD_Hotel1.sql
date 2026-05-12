CREATE TABLE GUEST (
    id_guest         NUMBER          CONSTRAINT pk_guest PRIMARY KEY,
    nama_lengkap    VARCHAR2(100)   NOT NULL,
    email           VARCHAR2(100)   NOT NULL,
    no_telepon      VARCHAR2(20),
    no_identitas    VARCHAR2(30),               -- KTP / Passport
    kewarganegaraan VARCHAR2(50)    DEFAULT 'Indonesia',
    tanggal_daftar  DATE            DEFAULT SYSDATE NOT NULL,
    CONSTRAINT uq_tamu_email        UNIQUE (email),
    CONSTRAINT uq_tamu_identitas    UNIQUE (no_identitas)
);
CREATE TABLE TIPE_KAMAR (
    id_tipe             NUMBER          CONSTRAINT pk_tipe_kamar PRIMARY KEY,
    nama_tipe           VARCHAR2(50)    NOT NULL,
    deskripsi           VARCHAR2(500),
    harga_per_malam     NUMBER(12,2)    NOT NULL,
    kapasitas           NUMBER(2)       DEFAULT 2 NOT NULL,
    jumlah_unit         NUMBER(3)       DEFAULT 0 NOT NULL,
    CONSTRAINT uq_tipe_kamar_nama   UNIQUE (nama_tipe),
    CONSTRAINT chk_harga            CHECK (harga_per_malam > 0),
    CONSTRAINT chk_kapasitas        CHECK (kapasitas BETWEEN 1 AND 10)
);
CREATE TABLE KAMAR (
    id_kamar        NUMBER          CONSTRAINT pk_kamar PRIMARY KEY,
    nomor_kamar     VARCHAR2(10)    NOT NULL,
    lantai          NUMBER(2)       NOT NULL,
    id_tipe         NUMBER          NOT NULL,
    status          VARCHAR2(20)    DEFAULT 'TERSEDIA' NOT NULL,
    keterangan      VARCHAR2(200),
    CONSTRAINT uq_nomor_kamar   UNIQUE (nomor_kamar),
    CONSTRAINT fk_kamar_tipe    FOREIGN KEY (id_tipe) REFERENCES TIPE_KAMAR(id_tipe),
    CONSTRAINT chk_kamar_status CHECK (status IN ('TERSEDIA','TERISI','MAINTENANCE','CLEANING'))
);
CREATE TABLE RESERVASI (
    id_reservasi        NUMBER          CONSTRAINT pk_reservasi PRIMARY KEY,
    id_guest             NUMBER          NOT NULL,
    tanggal_check_in    DATE            NOT NULL,
    tanggal_check_out   DATE            NOT NULL,
    jumlah_tamu         NUMBER(2)       DEFAULT 1 NOT NULL,
    status_reservasi    VARCHAR2(20)    DEFAULT 'PENDING' NOT NULL,
    sumber_booking      VARCHAR2(30)    DEFAULT 'LANGSUNG',
    tanggal_dibuat      DATE            DEFAULT SYSDATE NOT NULL,
    catatan             VARCHAR2(500),
    CONSTRAINT fk_reservasi_guest    FOREIGN KEY (id_guest) REFERENCES GUEST(id_guest),
    CONSTRAINT chk_reservasi_status CHECK (status_reservasi IN ('PENDING','CONFIRMED','CHECKED_IN','CHECKED_OUT','CANCELLED','NO_SHOW')),
    CONSTRAINT chk_sumber_booking   CHECK (sumber_booking IN ('LANGSUNG','TELEPON','AGODA','TRAVELOKA','TIKET_COM','LAINNYA')),
    CONSTRAINT chk_tanggal_valid    CHECK (tanggal_check_out > tanggal_check_in),
    CONSTRAINT chk_jumlah_tamu      CHECK (jumlah_tamu >= 1)
);
CREATE TABLE DETAIL_RESERVASI (
    id_detail           NUMBER          CONSTRAINT pk_detail_reservasi PRIMARY KEY,
    id_reservasi        NUMBER          NOT NULL,
    id_kamar            NUMBER          NOT NULL,
    harga_per_malam     NUMBER(12,2)    NOT NULL,
    total_malam         NUMBER(3)       NOT NULL,
    subtotal            NUMBER(14,2)    GENERATED ALWAYS AS (harga_per_malam * total_malam) VIRTUAL,
    CONSTRAINT fk_detail_reservasi  FOREIGN KEY (id_reservasi) REFERENCES RESERVASI(id_reservasi) ON DELETE CASCADE,
    CONSTRAINT fk_detail_kamar      FOREIGN KEY (id_kamar)     REFERENCES KAMAR(id_kamar),
    CONSTRAINT uq_reservasi_kamar   UNIQUE (id_reservasi, id_kamar),
    CONSTRAINT chk_detail_harga     CHECK (harga_per_malam > 0),
    CONSTRAINT chk_detail_malam     CHECK (total_malam >= 1)
);
CREATE TABLE FASILITAS (
    id_fasilitas        NUMBER          CONSTRAINT pk_fasilitas PRIMARY KEY,
    id_reservasi        NUMBER          NOT NULL,
    jenis_fasilitas     VARCHAR2(30)    NOT NULL,
    tanggal_penggunaan  DATE            DEFAULT SYSDATE NOT NULL,
    biaya               NUMBER(12,2)    DEFAULT 0 NOT NULL,
    keterangan          VARCHAR2(300),
    CONSTRAINT fk_fasilitas_reservasi   FOREIGN KEY (id_reservasi) REFERENCES RESERVASI(id_reservasi) ON DELETE CASCADE,
    CONSTRAINT chk_jenis_fasilitas      CHECK (jenis_fasilitas IN ('MEETING_ROOM','ROOM_SERVICE','LAUNDRY','HARLYS_CAFE','WIFI_PREMIUM','AIRPORT_TRANSFER','LAINNYA')),
    CONSTRAINT chk_fasilitas_biaya      CHECK (biaya >= 0)
);
CREATE TABLE PEMBAYARAN (
    id_pembayaran   NUMBER          CONSTRAINT pk_pembayaran PRIMARY KEY,
    id_reservasi    NUMBER          NOT NULL,
    tanggal_bayar   DATE            DEFAULT SYSDATE NOT NULL,
    jumlah_bayar    NUMBER(14,2)    NOT NULL,
    metode_bayar    VARCHAR2(30)    NOT NULL,
    status_bayar    VARCHAR2(20)    DEFAULT 'LUNAS' NOT NULL,
    no_referensi    VARCHAR2(100),
    keterangan      VARCHAR2(300),
    CONSTRAINT fk_pembayaran_reservasi  FOREIGN KEY (id_reservasi) REFERENCES RESERVASI(id_reservasi) ON DELETE CASCADE,  -- [FIX] tambah ON DELETE CASCADE
    CONSTRAINT chk_metode_bayar         CHECK (metode_bayar IN ('TUNAI','TRANSFER_BANK','KARTU_KREDIT','KARTU_DEBIT','QRIS','OVO','GOPAY','DANA','LAINNYA')),
    CONSTRAINT chk_status_bayar         CHECK (status_bayar IN ('DP','LUNAS','REFUND','GAGAL')),
    CONSTRAINT chk_jumlah_bayar         CHECK (jumlah_bayar > 0)
);
CREATE SEQUENCE SEQ_GUEST              START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_TIPE_KAMAR        START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_KAMAR             START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_RESERVASI         START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_DETAIL_RESERVASI  START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_FASILITAS         START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE SEQ_PEMBAYARAN        START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;

CREATE OR REPLACE TRIGGER TRG_GUEST_ID
BEFORE INSERT ON GUEST
FOR EACH ROW
BEGIN
    IF :NEW.id_guest IS NULL THEN
        :NEW.id_guest := SEQ_GUEST.NEXTVAL;
    END IF;
END;
/
CREATE OR REPLACE TRIGGER TRG_TIPE_KAMAR_ID
BEFORE INSERT ON TIPE_KAMAR
FOR EACH ROW
BEGIN
    IF :NEW.id_tipe IS NULL THEN
        :NEW.id_tipe := SEQ_TIPE_KAMAR.NEXTVAL;
    END IF;
END;
/
 
CREATE OR REPLACE TRIGGER TRG_KAMAR_ID
BEFORE INSERT ON KAMAR
FOR EACH ROW
BEGIN
    IF :NEW.id_kamar IS NULL THEN
        :NEW.id_kamar := SEQ_KAMAR.NEXTVAL;
    END IF;
END;
/
 
CREATE OR REPLACE TRIGGER TRG_RESERVASI_ID
BEFORE INSERT ON RESERVASI
FOR EACH ROW
BEGIN
    IF :NEW.id_reservasi IS NULL THEN
        :NEW.id_reservasi := SEQ_RESERVASI.NEXTVAL;
    END IF;
END;
/
 
CREATE OR REPLACE TRIGGER TRG_DETAIL_RESERVASI_ID
BEFORE INSERT ON DETAIL_RESERVASI
FOR EACH ROW
BEGIN
    IF :NEW.id_detail IS NULL THEN
        :NEW.id_detail := SEQ_DETAIL_RESERVASI.NEXTVAL;
    END IF;
END;
/
 
CREATE OR REPLACE TRIGGER TRG_FASILITAS_ID
BEFORE INSERT ON FASILITAS
FOR EACH ROW
BEGIN
    IF :NEW.id_fasilitas IS NULL THEN
        :NEW.id_fasilitas := SEQ_FASILITAS.NEXTVAL;
    END IF;
END;
/
 
CREATE OR REPLACE TRIGGER TRG_PEMBAYARAN_ID
BEFORE INSERT ON PEMBAYARAN
FOR EACH ROW
BEGIN
    IF :NEW.id_pembayaran IS NULL THEN
        :NEW.id_pembayaran := SEQ_PEMBAYARAN.NEXTVAL;
    END IF;
END;
/

CREATE OR REPLACE TRIGGER TRG_DETAIL_TOTAL_MALAM
BEFORE INSERT OR UPDATE ON DETAIL_RESERVASI
FOR EACH ROW
DECLARE
    v_ci DATE;
    v_co DATE;
BEGIN
    SELECT tanggal_check_in, tanggal_check_out
    INTO   v_ci, v_co
    FROM   RESERVASI
    WHERE  id_reservasi = :NEW.id_reservasi;
 
    :NEW.total_malam := v_co - v_ci;
END;
/

CREATE OR REPLACE TRIGGER TRG_UPDATE_STATUS_KAMAR
AFTER UPDATE OF status_reservasi ON RESERVASI
FOR EACH ROW
BEGIN
    IF :NEW.status_reservasi = 'CHECKED_IN' THEN
        UPDATE KAMAR k
        SET k.status = 'TERISI'
        WHERE k.id_kamar IN (
            SELECT d.id_kamar FROM DETAIL_RESERVASI d WHERE d.id_reservasi = :NEW.id_reservasi
        );
    ELSIF :NEW.status_reservasi IN ('CHECKED_OUT','CANCELLED','NO_SHOW') THEN  -- [FIX] tambah NO_SHOW
        UPDATE KAMAR k
        SET k.status = 'TERSEDIA'
        WHERE k.id_kamar IN (
            SELECT d.id_kamar FROM DETAIL_RESERVASI d WHERE d.id_reservasi = :NEW.id_reservasi
        );
    END IF;
END;
/

CREATE INDEX IDX_RESERVASI_GUEST       ON RESERVASI(id_guest);
CREATE INDEX IDX_RESERVASI_CHECKIN    ON RESERVASI(tanggal_check_in);
CREATE INDEX IDX_RESERVASI_STATUS     ON RESERVASI(status_reservasi);
CREATE INDEX IDX_DETAIL_RESERVASI     ON DETAIL_RESERVASI(id_reservasi);
CREATE INDEX IDX_DETAIL_KAMAR         ON DETAIL_RESERVASI(id_kamar);
CREATE INDEX IDX_KAMAR_STATUS         ON KAMAR(status);
CREATE INDEX IDX_KAMAR_TIPE           ON KAMAR(id_tipe);
CREATE INDEX IDX_PEMBAYARAN_RESERVASI ON PEMBAYARAN(id_reservasi);
CREATE INDEX IDX_FASILITAS_RESERVASI  ON FASILITAS(id_reservasi);

INSERT INTO TIPE_KAMAR (nama_tipe, deskripsi, harga_per_malam, kapasitas, jumlah_unit) VALUES
('Standard', 'Kamar standar dengan desain modern dan elegan. Dilengkapi WiFi gratis dan TV layar datar 32 inci.', 350000, 2, 30);
 
INSERT INTO TIPE_KAMAR (nama_tipe, deskripsi, harga_per_malam, kapasitas, jumlah_unit) VALUES
('Superior Twin', 'Kamar superior dengan 2 tempat tidur terpisah. Cocok untuk tamu yang berbagi kamar.', 450000, 2, 28);
 
INSERT INTO TIPE_KAMAR (nama_tipe, deskripsi, harga_per_malam, kapasitas, jumlah_unit) VALUES
('Superior Double', 'Kamar superior dengan 1 tempat tidur double berukuran besar. Ideal untuk pasangan.', 480000, 2, 30);
 
INSERT INTO TIPE_KAMAR (nama_tipe, deskripsi, harga_per_malam, kapasitas, jumlah_unit) VALUES
('Superior Deluxe', 'Kamar deluxe terlengkap dengan fasilitas premium. Pengalaman menginap terbaik di Harlys.', 600000, 3, 24);

-- Lantai 1: Standard (101-110)
INSERT INTO KAMAR (nomor_kamar, lantai, id_tipe, status)
VALUES ('101', 1, (SELECT id_tipe FROM TIPE_KAMAR WHERE nama_tipe = 'Standard'), 'TERSEDIA');
 
INSERT INTO KAMAR (nomor_kamar, lantai, id_tipe, status)
VALUES ('102', 1, (SELECT id_tipe FROM TIPE_KAMAR WHERE nama_tipe = 'Standard'), 'TERSEDIA');
 
INSERT INTO KAMAR (nomor_kamar, lantai, id_tipe, status)
VALUES ('103', 1, (SELECT id_tipe FROM TIPE_KAMAR WHERE nama_tipe = 'Standard'), 'TERSEDIA');
 
-- Lantai 2: Superior Twin (201-210)
INSERT INTO KAMAR (nomor_kamar, lantai, id_tipe, status)
VALUES ('201', 2, (SELECT id_tipe FROM TIPE_KAMAR WHERE nama_tipe = 'Superior Twin'), 'TERSEDIA');
 
INSERT INTO KAMAR (nomor_kamar, lantai, id_tipe, status)
VALUES ('202', 2, (SELECT id_tipe FROM TIPE_KAMAR WHERE nama_tipe = 'Superior Twin'), 'TERSEDIA');
 
-- Lantai 3: Superior Double (301-310)
INSERT INTO KAMAR (nomor_kamar, lantai, id_tipe, status)
VALUES ('301', 3, (SELECT id_tipe FROM TIPE_KAMAR WHERE nama_tipe = 'Superior Double'), 'TERSEDIA');
 
INSERT INTO KAMAR (nomor_kamar, lantai, id_tipe, status)
VALUES ('302', 3, (SELECT id_tipe FROM TIPE_KAMAR WHERE nama_tipe = 'Superior Double'), 'TERSEDIA');
 
-- Lantai 4: Superior Deluxe (401-410)
INSERT INTO KAMAR (nomor_kamar, lantai, id_tipe, status)
VALUES ('401', 4, (SELECT id_tipe FROM TIPE_KAMAR WHERE nama_tipe = 'Superior Deluxe'), 'TERSEDIA');
 
INSERT INTO KAMAR (nomor_kamar, lantai, id_tipe, status)
VALUES ('402', 4, (SELECT id_tipe FROM TIPE_KAMAR WHERE nama_tipe = 'Superior Deluxe'), 'TERSEDIA');
 
COMMIT;

SELECT k.nomor_kamar, k.lantai, t.nama_tipe, t.harga_per_malam, k.status
FROM KAMAR k
JOIN TIPE_KAMAR t ON k.id_tipe = t.id_tipe
WHERE k.status = 'TERSEDIA'
AND k.id_kamar NOT IN (
    SELECT d.id_kamar
    FROM DETAIL_RESERVASI d
    JOIN RESERVASI r ON d.id_reservasi = r.id_reservasi
    WHERE r.status_reservasi IN ('CONFIRMED','CHECKED_IN')
    AND NOT (r.tanggal_check_out <= :ChIn OR r.tanggal_check_in >= :ChOt)
)
ORDER BY t.harga_per_malam, k.nomor_kamar;

SELECT
    r.id_reservasi,
    gs.nama_lengkap,
    r.tanggal_check_in,
    r.tanggal_check_out,
    NVL(SUM(d.subtotal), 0)  AS total_kamar,
    NVL((SELECT SUM(f.biaya) FROM FASILITAS f WHERE f.id_reservasi = r.id_reservasi), 0) AS total_fasilitas,
    NVL(SUM(d.subtotal), 0)
    + NVL((SELECT SUM(f.biaya) FROM FASILITAS f WHERE f.id_reservasi = r.id_reservasi), 0) AS grand_total
FROM RESERVASI r
JOIN GUEST gs ON r.id_guest = gs.id_guest
LEFT JOIN DETAIL_RESERVASI d ON r.id_reservasi = d.id_reservasi
WHERE r.id_reservasi = :id_reservasi
GROUP BY r.id_reservasi, gs.nama_lengkap, r.tanggal_check_in, r.tanggal_check_out;

SELECT
    TO_CHAR(p.tanggal_bayar, 'YYYY-MM')    AS bulan,
    COUNT(DISTINCT p.id_reservasi)          AS jumlah_reservasi,
    SUM(p.jumlah_bayar)                     AS total_pendapatan
FROM PEMBAYARAN p
WHERE p.status_bayar = 'LUNAS'
GROUP BY TO_CHAR(p.tanggal_bayar, 'YYYY-MM')
ORDER BY bulan DESC;

SELECT k.nomor_kamar, t.nama_tipe, gs.nama_lengkap, r.tanggal_check_out
FROM KAMAR k
JOIN DETAIL_RESERVASI d ON k.id_kamar = d.id_kamar
JOIN RESERVASI r ON d.id_reservasi = r.id_reservasi
JOIN GUEST gs ON r.id_guest = gs.id_guest
JOIN TIPE_KAMAR t ON k.id_tipe = t.id_tipe
WHERE r.status_reservasi = 'CHECKED_IN'
AND SYSDATE BETWEEN r.tanggal_check_in AND r.tanggal_check_out
ORDER BY r.tanggal_check_out;

CREATE TABLE ADMIN_USER (
    id_admin     NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nama_lengkap VARCHAR2(100) NOT NULL,
    email        VARCHAR2(100) UNIQUE NOT NULL,
    password_hash VARCHAR2(255) NOT NULL,  -- simpan hash bcrypt, BUKAN plain text
    role         VARCHAR2(20)  DEFAULT 'STAFF' CHECK (role IN ('SUPER_ADMIN','MANAGER','STAFF')),
    no_telepon   VARCHAR2(20),
    aktif        NUMBER(1)     DEFAULT 1,
    tanggal_dibuat DATE        DEFAULT SYSDATE
);

-- Insert akun admin pertama (password: admin123 dalam bentuk plain, ganti dengan hash)
INSERT INTO ADMIN_USER (nama_lengkap, email, password_hash, role)
VALUES ('Administrator', 'admin@harlysresidence.com', 'admin123', 'SUPER_ADMIN');

COMMIT;

CREATE TABLE KONTEN_HOTEL (
    id_konten    NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kunci        VARCHAR2(100) UNIQUE NOT NULL,  -- nama_hotel, tagline, deskripsi, dll
    nilai        CLOB,
    terakhir_diubah DATE DEFAULT SYSDATE
);
INSERT INTO KONTEN_HOTEL (kunci, nilai) VALUES ('nama_hotel', 'Harlys Residence');
INSERT INTO KONTEN_HOTEL (kunci, nilai) VALUES ('tagline', 'Your best resting place');
INSERT INTO KONTEN_HOTEL (kunci, nilai) VALUES ('deskripsi', 'Harlys Residence menghadirkan pengalaman menginap mewah di tengah kota.');
INSERT INTO KONTEN_HOTEL (kunci, nilai) VALUES ('alamat', 'Jl. Raya Utama No. 45, Jakarta Barat');
INSERT INTO KONTEN_HOTEL (kunci, nilai) VALUES ('telepon', '+62 2134-4352-319');
INSERT INTO KONTEN_HOTEL (kunci, nilai) VALUES ('email_hotel', 'info@harlysresidence.com');
INSERT INTO KONTEN_HOTEL (kunci, nilai) VALUES ('waktu_checkin', '14:00');
INSERT INTO KONTEN_HOTEL (kunci, nilai) VALUES ('waktu_checkout', '12:00');

COMMIT;

SELECT column_name, data_type 
FROM user_tab_columns 
WHERE table_name = 'RESERVASI'
ORDER BY column_id;