import { generateKeyPairSync, createSign, randomBytes } from "crypto";

export default function generateSelfSignedCert() {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

    // Minimal ASN.1 DER encoding helpers
    function der(tag, ...chunks) {
        const data = Buffer.concat(chunks);
        const len = data.length;
        if (len < 128) return Buffer.concat([Buffer.from([tag, len]), data]);
        const lenBytes = [];
        let tmp = len;
        while (tmp > 0) { lenBytes.unshift(tmp & 0xff); tmp >>= 8; }
        return Buffer.concat([Buffer.from([tag, 0x80 | lenBytes.length, ...lenBytes]), data]);
    }
    const seq = (...c) => der(0x30, ...c);
    const set = (...c) => der(0x31, ...c);
    const int = (n) => { const b = Buffer.from([n]); return der(0x02, b); };
    const intBytes = (buf) => {
        // Ensure positive integer (prepend 0x00 if high bit set)
        if (buf[0] & 0x80) buf = Buffer.concat([Buffer.from([0x00]), buf]);
        return der(0x02, buf);
    };
    const oid = (bytes) => der(0x06, Buffer.from(bytes));
    const utf8 = (s) => der(0x0c, Buffer.from(s, 'utf8'));
    const bitstring = (buf) => der(0x03, Buffer.concat([Buffer.from([0x00]), buf]));
    const explicit = (tag, ...c) => der(0xa0 | tag, ...c);

    // OIDs
    const ecPublicKeyOid = oid([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]); // 1.2.840.10045.2.1
    const prime256v1Oid = oid([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07]); // 1.2.840.10045.3.1.7
    const sha256WithEcdsaOid = oid([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02]); // 1.2.840.10045.4.3.2
    const cnOid = oid([0x55, 0x04, 0x03]); // 2.5.4.3

    const signatureAlgorithm = seq(sha256WithEcdsaOid);

    // Subject/Issuer: CN=localhost
    const name = seq(set(seq(cnOid, utf8('localhost'))));

    // Validity: not before now, not after +365 days
    const now = new Date();
    const later = new Date(now.getTime() + 365 * 86400000);
    const formatTime = (d) => {
        const s = d.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z';
        return der(0x17, Buffer.from(s, 'ascii')); // UTCTime
    };
    const validity = seq(formatTime(now), formatTime(later));

    // SubjectPublicKeyInfo from the generated key
    const spkiDer = publicKey.export({ format: 'der', type: 'spki' });

    // Serial number
    const serial = intBytes(randomBytes(8));

    // TBSCertificate
    const tbs = seq(
        explicit(0, int(2)), // version v3
        serial,
        signatureAlgorithm,
        name, // issuer
        validity,
        name, // subject
        Buffer.from(spkiDer),
    );

    // Sign TBSCertificate
    const signer = createSign('SHA256');
    signer.update(tbs);
    const signature = signer.sign(privateKey);

    // Certificate
    const cert = seq(tbs, signatureAlgorithm, bitstring(signature));

    // Encode as PEM
    const certPem = `-----BEGIN CERTIFICATE-----\n${cert.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;
    const keyPem = privateKey.export({ format: 'pem', type: 'pkcs8' });

    return { key: keyPem, cert: certPem };
}
