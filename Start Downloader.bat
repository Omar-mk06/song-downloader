@echo off
title Song Downloader Server
echo Starting Song Downloader Server...
echo Keep this window open while using Spotify.
echo.
python "%~dp0spotdl-server.py"
pause
