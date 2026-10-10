@echo off
cd /d "%~dp0"
del /q test.txt test2.txt test3.txt test4.txt test5.txt test6.txt test7.txt test8.txt test9.txt test10.txt test11.txt test12.txt test13.txt test14.txt verification.txt omni.log server.log training.log.old analysis_report.md report_summary.md tests\bandit.test.cjs tests\minimal-test-fallback.cjs tests\test-429-fallback.cjs tests\test-fallback-direct.cjs
echo Cleanup complete