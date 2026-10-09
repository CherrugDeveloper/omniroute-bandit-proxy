# Security Reviewer Mode - OmniRoute Bandit Proxy AGENTS.md

## Security Reviewer Mode Specific Instructions

### Security Assessment Overview

The Security Reviewer mode is designed for auditing code for security vulnerabilities, reviewing code for security best practices, and identifying potential security risks. It specializes in systematic debugging, adding logging, analyzing stack traces, and identifying root causes before applying fixes.

### Key Security Review Areas

#### 1. Authentication and Authorization
- **Dashboard Token**: Optional but strongly recommended
- **API Endpoints**: `/v1/metrics`, `/v1/reset/provider/:p`, `/v1/provider/retry/:p` require auth
- **Session Management**: 24-hour TTL with automatic cleanup

#### 2. Input Validation
- **Request Validation**: Comprehensive validation of chat completions
- **Token Estimation**: `estimateTokens()` for accurate context window validation
- **Content Filtering**: Validation of response content
- **Stream Validation**: SSE stream validation

#### 3. Error Handling
- **Error Classification**: Comprehensive error classification with specific actions
- **Information Disclosure**: Error messages may contain sensitive information
- **Error Logging**: All errors logged to console and database

#### 4. Data Protection
- **Logging**: All interactions logged (console, database, training.log)
- **Data Retention**: No explicit data retention policies
- **Backup**: Database backups not implemented

### Security Review Checklist

#### 1. Authentication and Authorization
- [ ] Dashboard token is configured and used
- [ ] API endpoints require authentication
- [ ] Session management is secure
- [ ] Token validation is implemented

#### 2. Input Validation
- [ ] Request validation is comprehensive
- [ ] Token estimation is accurate
- [ ] Content filtering is implemented
- [ ] Stream validation is secure

#### 3. Error Handling
- [ ] Error classification is secure
- [ ] Error messages don't leak sensitive information
- [ ] Error logging is secure
- [ ] Error recovery is secure

#### 4. Data Protection
- [ ] Logging is secure
- [ ] Data retention policies are defined
- [ ] Backup procedures are secure
- [ ] Access controls are implemented

### Security Review Tools and Techniques

#### 1. Static Analysis
- **Code Review**: Manual review of code for security issues
- **Pattern Analysis**: Look for common security patterns
- **Dependency Analysis**: Check for vulnerable dependencies
- **Configuration Analysis**: Review environment variables and configuration

#### 2. Dynamic Analysis
- **Fuzz Testing**: Test with malformed inputs
- **Load Testing**: Test with high load
- **Stress Testing**: Test with extreme conditions
- ** penetration Testing**: Test security controls

#### 3. Manual Testing
- **Authentication Testing**: Test authentication mechanisms
- **Authorization Testing**: Test authorization controls
- **Input Validation Testing**: Test input validation
- **Error Handling Testing**: Test error handling

### Security Review Commands

#### 1. Authentication Testing
```bash
# Test authentication
curl -H "Authorization: Bearer <token>" http://127.0.0.1:8080/v1/metrics
```

#### 2. Input Validation Testing
```bash
# Test with malformed input
curl -X POST http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"invalid": "input"}'
```

#### 3. Error Handling Testing
```bash
# Test error handling
curl -X POST http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "nonexistent", "messages": []}'
```

### Security Review Best Practices

#### 1. Secure Coding
- **Principle of Least Privilege**: Use minimum necessary permissions
- **Defense in Depth**: Multiple layers of security
- **Fail Secure**: Fail securely when errors occur
- **Input Validation**: Validate all inputs

#### 2. Secure Configuration
- **Environment Variables**: Use environment variables for configuration
- **Secure Defaults**: Secure default configuration
- **Configuration Validation**: Validate configuration
- **Configuration Management**: Manage configuration securely

#### 3. Secure Deployment
- **Process Management**: Use proper process management
- **Environment Isolation**: Isolate environments
- **Network Security**: Secure network configuration
- **Application Security**: Secure application configuration

### Security Review Common Issues

#### 1. Authentication Issues
- **Missing Authentication**: API endpoints without authentication
- **Weak Authentication**: Weak authentication mechanisms
- **Authentication Bypass**: Authentication bypass vulnerabilities
- **Session Management**: Insecure session management

#### 2. Authorization Issues
- **Missing Authorization**: Missing authorization controls
- **Weak Authorization**: Weak authorization mechanisms
- **Authorization Bypass**: Authorization bypass vulnerabilities
- **Privilege Escalation**: Privilege escalation vulnerabilities

#### 3. Input Validation Issues
- **Missing Validation**: Missing input validation
- **Weak Validation**: Weak input validation
- **Validation Bypass**: Input validation bypass vulnerabilities
- **Injection Attacks**: Injection attack vulnerabilities

#### 4. Error Handling Issues
- **Information Disclosure**: Error messages leak sensitive information
- **Error Logging**: Insecure error logging
- **Error Recovery**: Insecure error recovery
- **Error Testing**: Inadequate error testing

### Security Review Remediation

#### 1. Authentication Remediation
- **Implement Authentication**: Implement authentication for all API endpoints
- **Strengthen Authentication**: Strengthen authentication mechanisms
- **Fix Authentication Bypass**: Fix authentication bypass vulnerabilities
- **Secure Session Management**: Secure session management

#### 2. Authorization Remediation
- **Implement Authorization**: Implement authorization controls
- **Strengthen Authorization**: Strengthen authorization mechanisms
- **Fix Authorization Bypass**: Fix authorization bypass vulnerabilities
- **Fix Privilege Escalation**: Fix privilege escalation vulnerabilities

#### 3. Input Validation Remediation
- **Implement Validation**: Implement input validation
- **Strengthen Validation**: Strengthen input validation
- **Fix Validation Bypass**: Fix input validation bypass vulnerabilities
- **Fix Injection Attacks**: Fix injection attack vulnerabilities

#### 4. Error Handling Remediation
- **Secure Error Messages**: Secure error messages
- **Secure Error Logging**: Secure error logging
- **Secure Error Recovery**: Secure error recovery
- **Improve Error Testing**: Improve error testing

### Security Review Monitoring

#### 1. Security Monitoring
- **Authentication Monitoring**: Monitor authentication attempts
- **Authorization Monitoring**: Monitor authorization attempts
- **Input Validation Monitoring**: Monitor input validation
- **Error Monitoring**: Monitor errors

#### 2. Performance Monitoring
- **Request Monitoring**: Monitor requests
- **Response Monitoring**: Monitor responses
- **Latency Monitoring**: Monitor latency
- **Error Rate Monitoring**: Monitor error rates

### Security Review Continuous Improvement

#### 1. Security Testing
- **Regular Testing**: Regular security testing
- **Penetration Testing**: Penetration testing
- **Code Review**: Regular code review
- **Dependency Scanning**: Regular dependency scanning

#### 2. Security Training
- **Security Training**: Security training for developers
- **Security Awareness**: Security awareness training
- **Security Documentation**: Security documentation
- **Security Policies**: Security policies

### Security Review Conclusion

The Security Reviewer mode is essential for identifying and fixing security vulnerabilities in the OmniRoute Bandit Proxy system. By following the patterns and practices outlined in this document, security reviewers can effectively identify and fix security issues in the system. Regular security reviews and testing are essential for maintaining security in the system.