# Plan: Dashboard Improvements & Refinements

This plan addresses the precise user feedback and refinements for `public/dashboard.html` and backend endpoints.

## Tasks
1. **Start Daemon Workflow**: Ensure "Start daemon" correctly launches both `train-daemon.mjs` and `train-ctl.sh` (or control actions).
2. **Scripts Manager Quick Actions**: Make quick action container/box active and visible when the "RUNNING" badge is present in Scripts Manager.
3. **Log Training Navigation**: Ensure the "Log Training" button simply navigates to the Scripts Manager tab (`switchTab('scripts')`).
4. **Train Tab Cleanup**: Completely remove the metrics bar from the Train tab (`display:none` or remove HTML).
5. **Tested Models Verification**: Investigate and fix why models tested by the training daemon are not being displayed correctly in the Train tab.
6. **Container-Scoped Reset Buttons**: Provide independent reset buttons for each top UI box that reset *only* the metrics/data of that specific box, styled similarly to the main metrics box reset button.
7. **Verification**: Verify all changes and functionality.
8. **CI/CD**: Execute auto-git workflow.
