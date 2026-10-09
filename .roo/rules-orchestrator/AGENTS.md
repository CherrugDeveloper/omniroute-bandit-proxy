# Orchestrator Mode - OmniRoute Bandit Proxy AGENTS.md

## Orchestrator Mode Specific Instructions

### Project Coordination

The Orchestrator mode is designed for complex, multi-step projects that require coordination across different specialties. It breaks down large tasks into subtasks, manages workflows, and coordinates work that spans multiple domains or expertise areas.

### Key Orchestrator Responsibilities

#### 1. Task Decomposition
- Break down complex tasks into manageable subtasks
- Prioritize tasks in logical order
- Define clear success criteria for each subtask
- Identify dependencies between tasks

#### 2. Workflow Management
- Coordinate execution of multiple tasks in parallel when possible
- Manage task dependencies and sequencing
- Track progress and update status
- Handle task failures and recovery

#### 3. Cross-Domain Coordination
- Bridge gaps between different technical domains
- Ensure consistency across different components
- Manage handoffs between different teams or specialists
- Resolve conflicts and make trade-offs

### Orchestrator-Specific Patterns

#### 1. Sequential Task Execution
```bash
# Example: Sequential execution
npm run build
npm run test
npm run deploy
```

#### 2. Parallel Task Execution
```bash
# Example: Parallel execution
npm run build &
npm run test &
wait
npm run deploy
```

#### 3. Conditional Execution
```bash
# Example: Conditional execution
if [ -f "package.json" ]; then
  npm install
fi
```

### Orchestrator Tools and Scripts

#### 1. Scripts Directory
- `scripts/clean-cjs-tests.mjs`: Cleans up CJS test files
- `scripts/restart.sh`: Restarts the service
- `scripts/switch-mode.sh`: Switches between modes
- `scripts/train-ctl.sh`: Controls training daemon
- `scripts/train-daemon.mjs`: Training daemon

#### 2. Key Scripts

##### `scripts/restart.sh`
Restarts the service and shows startup logs.

##### `scripts/switch-mode.sh`
Switches between different operational modes (TRAIN, PROD).

##### `scripts/train-ctl.sh`
Controls the training daemon (start, stop, status, logs, restart).

### Orchestrator Workflows

#### 1. Development Workflow
```bash
# Development workflow
npm run dev
# Monitor logs
# Test changes
# Deploy when ready
```

#### 2. Testing Workflow
```bash
# Testing workflow
npm test
# Check coverage
# Run specific tests
# Fix issues
```

#### 3. Deployment Workflow
```bash
# Deployment workflow
npm run build
npm run check
npm start
# Monitor health
# Verify functionality
```

### Orchestrator Best Practices

#### 1. Task Management
- Use checklists to track progress
- Update status regularly
- Communicate progress to stakeholders
- Document decisions and rationale

#### 2. Coordination
- Establish clear communication channels
- Define roles and responsibilities
- Set up regular sync meetings
- Use version control for coordination

#### 3. Quality Assurance
- Implement automated testing
- Use continuous integration
- Monitor system health
- Track performance metrics

### Orchestrator-Specific Features

#### 1. Mode Switching
The system supports multiple operational modes:
- **TRAIN**: Training mode for model evaluation
- **PROD**: Production mode for live traffic

#### 2. Health Checks
- Automatic health checks every 5 minutes
- Model revival when providers become available
- Health check endpoint for monitoring

#### 3. Session Management
- Session affinity for consistent routing
- 24-hour TTL for sessions
- Automatic cleanup of expired sessions

### Orchestrator Commands

#### 1. Mode Switching
```bash
# Switch to training mode
./scripts/switch-mode.sh train

# Switch to production mode
./scripts/switch-mode.sh prod
```

#### 2. Service Management
```bash
# Restart service
./scripts/restart.sh

# Check service status
./scripts/train-ctl.sh status
```

#### 3. Training Management
```bash
# Start training
./scripts/train-ctl.sh start

# Stop training
./scripts/train-ctl.sh stop

# Check training logs
./scripts/train-ctl.sh logs
```

### Orchestrator Monitoring

#### 1. System Monitoring
- Health check endpoint
- Training daemon logs
- System metrics
- Provider status

#### 2. Performance Monitoring
- Request latency
- Model selection performance
- Provider health
- Error rates

### Orchestrator Troubleshooting

#### 1. Common Issues
- **Provider not responding**: Check provider status, cooldown, attention flags
- **Model selection issues**: Check model status, catalog, rankings
- **Token limit issues**: Use estimateTokens() for accurate estimation
- **Session issues**: Check session TTL, cleanup

#### 2. Debugging Commands
```bash
# Check server status
ps aux | grep "node src/index.mjs"

# Check training logs
./scripts/train-ctl.sh logs

# Check provider status
# Use Node.js to query database
```

### Orchestrator Integration

#### 1. CI/CD Integration
- Automated testing
- Continuous deployment
- Health checks
- Rollback capabilities

#### 2. Monitoring Integration
- Health check endpoint
- Training daemon monitoring
- Provider status monitoring
- Performance metrics

### Orchestrator Success Metrics

#### 1. Development Metrics
- Code coverage
- Test pass rate
- Build success rate
- Deployment frequency

#### 2. Operational Metrics
- System uptime
- Request latency
- Error rate
- Provider availability

### Orchestrator Continuous Improvement

#### 1. Feedback Loop
- Collect feedback from stakeholders
- Analyze performance metrics
- Identify improvement opportunities
- Implement improvements

#### 2. Process Improvement
- Review and update processes
- Implement automation
- Improve documentation
- Train team members

### Orchestrator Conclusion

The Orchestrator mode is essential for managing complex, multi-step projects. It provides the coordination, communication, and workflow management needed to successfully deliver complex systems. By following the patterns and practices outlined in this document, orchestrators can effectively manage the development, deployment, and operation of the OmniRoute Bandit Proxy system.