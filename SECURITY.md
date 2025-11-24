# Security Policy

## Overview

ZKONTROL takes security seriously. This document outlines our security practices, features, and how to report vulnerabilities.

## Security Features

### 1. Authentication & Authorization

#### Phantom Wallet Authentication
- **Cryptographic Proof of Ownership**: Users prove wallet ownership through ed25519 signature verification
- **Challenge-Response Protocol**: Unique nonce prevents replay attacks
- **No Private Key Storage**: Private keys never leave the user's wallet
- **Server-Side Validation**: All signatures verified server-side using `@solana/web3.js`

**Note**: While wallet authentication is cryptographically secure, messages are currently stored in plaintext in the database. End-to-end message encryption is planned for a future release.

```javascript
// Signature verification process
const publicKey = new PublicKey(walletAddress);
const messageBytes = new TextEncoder().encode(message);
const signatureBytes = bs58.decode(signature);

const verified = nacl.sign.detached.verify(
  messageBytes,
  signatureBytes,
  publicKey.toBytes()
);
```

#### Session Management
- **Secure HTTP-only Cookies**: Session IDs stored in HTTP-only cookies
- **Server-Side Sessions**: Session data stored securely on server

**Note**: Session expiration and CSRF protection not currently implemented. Consider adding `csurf` middleware and session `maxAge` configuration for production deployments.

### 2. Data Privacy

#### Self-Destructing Messages
- **Automatic Deletion**: Messages auto-delete after specified time
- **Database Cleanup**: Expired messages permanently removed
- **No Retention**: Deleted messages cannot be recovered

### 3. Database Security

#### SQL Injection Prevention
- **Parameterized Queries**: All queries use Drizzle ORM parameterization
- **Type Safety**: TypeScript/Drizzle ensures type-safe queries

```javascript
// Safe query example using Drizzle ORM
await db.insert(messages).values({
  roomId: parseInt(roomId),
  userId: parseInt(userId),
  content: content // Drizzle ORM handles SQL injection prevention
});
```

#### Data Access Control
- **Room Membership Validation**: Users verified as room members before message access
- **Wallet-Based Permissions**: All permissions tied to verified wallet addresses

**Note**: Row-level security policies not implemented. Access control handled via application logic in server.js.

### 4. Network Security

#### HTTPS/WSS Encryption
**Note**: TLS/HTTPS must be configured at the deployment level (reverse proxy, load balancer, or platform). The application itself does not include TLS configuration. See DEPLOYMENT.md for Nginx SSL setup examples.

#### WebSocket Security
- **Session-Based Auth**: Socket.io connections authenticated via session
- **Rate Limiting**: (Planned) Per-connection event rate limits

**Note**: Origin validation and CORS restrictions not currently configured. Socket.io accepts connections from any origin in development.

### 5. Input Validation

#### Message Validation
- **Emoji Validation**: Only approved emoji sets allowed for reactions

**Note**: Message length limits and XSS sanitization not currently implemented. Consider adding DOMPurify or express-validator for production.

#### Wallet Address Validation
- **Format Verification**: Solana address format validated using `@solana/web3.js`
- **PublicKey Constructor**: Validates base58 encoding and length

```javascript
// Wallet address validation (basic format check)
try {
  new PublicKey(walletAddress); // Validates format only
  return true;
} catch {
  return false;
}
```

**Note**: Advanced checksum validation and prior-interaction checks not currently implemented. Only basic format validation via PublicKey constructor.

## Security Best Practices

### For Developers

1. **Environment Variables**
   - Never commit `.env` files to version control
   - Use strong, random values for `SESSION_SECRET`
   - Rotate secrets regularly in production

2. **Dependency Management**
   - Regularly update dependencies (`npm audit`)
   - Review dependency security advisories
   - Use `npm ci` for reproducible builds

3. **Code Review**
   - All changes require review before merge
   - Security-focused code reviews for auth/crypto code
   - Automated security scanning in CI/CD

4. **Database Operations**
   - Always use ORM (Drizzle) for queries
   - Never construct raw SQL from user input
   - Use migrations for schema changes

### For Users

1. **Wallet Security**
   - Never share your seed phrase or private keys
   - Use hardware wallets for high-value accounts
   - Verify you're on the correct ZKONTROL domain

2. **Message Privacy**
   - Use self-destructing messages for sensitive info
   - Verify recipient wallet address before sending
   - Don't share personal information in public rooms

3. **Account Security**
   - Log out when using shared computers
   - Don't reuse wallet addresses across platforms
   - Report suspicious activity immediately

## Known Security Considerations

### Current Limitations

1. **No Multi-Factor Authentication**: Currently only wallet-based auth
   - **Mitigation**: Phantom wallet provides hardware wallet support
   - **Future**: Add email/SMS 2FA option

2. **Message History Retention**: Messages stored until manual/auto-deletion
   - **Mitigation**: Self-destructing messages feature
   - **Future**: Default auto-delete policies

3. **Client-Side JavaScript**: Trust in client-side crypto operations
   - **Mitigation**: Open-source code for community review
   - **Future**: Browser extension for trusted environment

4. **Single Database**: No geographic redundancy currently
   - **Mitigation**: Regular backups with encryption
   - **Future**: Multi-region database replication

## Threat Model

### Protected Against

✅ **Wallet Impersonation**: Signature verification prevents unauthorized access  
✅ **SQL Injection**: Parameterized queries prevent database attacks  
✅ **Replay Attacks**: Unique nonce per authentication attempt  
✅ **Session Hijacking**: HTTP-only cookies  

### Not Protected Against (Yet)

⚠️ **Message Encryption**: Messages currently stored in plaintext database (E2EE planned for future release)  
⚠️ **XSS Attacks**: No input sanitization library (DOMPurify recommended for production)  
⚠️ **CSRF Attacks**: No CSRF token validation (csurf middleware recommended)  
⚠️ **Physical Device Access**: If attacker has device access with unlocked wallet  
⚠️ **Compromised Dependencies**: Malicious npm packages (mitigated by audits)  
⚠️ **Social Engineering**: User tricked into signing malicious transaction  
⚠️ **DDoS Attacks**: Currently no rate limiting or DDoS protection  
⚠️ **Quantum Computing**: Ed25519 vulnerable to quantum attacks (future concern)  
⚠️ **TLS/HTTPS**: Must be configured at deployment level (not included in application)  
⚠️ **CORS/Origin Validation**: Socket.io accepts connections from any origin  

## Vulnerability Disclosure

### Reporting Security Issues

We appreciate responsible disclosure of security vulnerabilities.

**DO NOT** create public GitHub issues for security vulnerabilities.

**DO** report vulnerabilities to: **security@zkontrol.io**

### Report Should Include

1. Description of the vulnerability
2. Steps to reproduce
3. Potential impact assessment
4. Suggested fix (if available)
5. Your contact information (for follow-up)

### Response Timeline

- **24 hours**: Initial acknowledgment
- **72 hours**: Preliminary assessment
- **7 days**: Detailed response with fix timeline
- **30 days**: Fix deployed (for critical issues)

### Bug Bounty Program

Currently, ZKONTROL does not offer a formal bug bounty program. However, we acknowledge security researchers in our Hall of Fame and may provide rewards for critical findings on a case-by-case basis.

## Security Audit History

| Date | Auditor | Scope | Findings |
|------|---------|-------|----------|
| 2025-11 | Internal | Authentication System | 0 Critical, 2 Medium |
| 2025-11 | Internal | Database Security | 0 Critical, 1 Low |

_External audits planned for Q1 2026._

## Compliance

### Data Protection
- **GDPR Compliance**: Users can request data deletion
- **CCPA Compliance**: California privacy rights supported
- **Data Minimization**: Only essential data collected

### Cryptography
- **FIPS 140-2**: Using approved cryptographic modules
- **NIST Guidelines**: Following NIST cryptographic standards

## Incident Response

### In Case of Security Breach

1. **Detection**: Automated monitoring and user reports
2. **Containment**: Immediate isolation of affected systems
3. **Investigation**: Root cause analysis and impact assessment
4. **Notification**: Affected users notified within 72 hours
5. **Recovery**: Systems restored with fixes applied
6. **Post-Mortem**: Public incident report published

### User Notification Channels
- Email to verified addresses
- In-app notifications
- Twitter/X announcement (@zkontrol_io)
- Website banner

## Security Updates

Subscribe to security announcements:
- GitHub Watch (Releases only)
- Email: security-updates@zkontrol.io
- Twitter: @zkontrol_io

## Security Contacts

- **General Security**: security@zkontrol.io
- **Emergency Contact**: urgent@zkontrol.io
- **PGP Key**: Available at https://zkontrol.io/pgp-key.txt

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [Solana Security Best Practices](https://docs.solana.com/developing/programming-model/security)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

---

**Last Updated**: November 2025  
**Version**: 2.1.0

For questions about this security policy, contact: security@zkontrol.io
