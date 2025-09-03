# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bus Tracker is a real-time NYC bus tracking application built with Next.js 15. It allows users to track bus arrivals between selected stops with optional arrival time checking.

## Tech Stack

- **Framework**: Next.js 15.2.3 with App Router
- **Language**: TypeScript with strict mode
- **UI**: React 19, Tailwind CSS, Headless UI
- **Package Manager**: Bun (based on bun.lock file)
- **API**: MTA's OneBusAway API

## Essential Commands

```bash
# Development
bun run dev          # Start development server (localhost:3000)

# Production build
bun run build        # Build for production
bun run start        # Start production server

# Code quality
bun run lint         # Run ESLint checks
bun run lint:fix     # Auto-fix linting issues
```

## Architecture

### File Structure
- `src/app/api/`: API routes with serverless caching (30min for static data, 30s for real-time)
- `src/components/BusTracker.tsx`: Main component handling all state management
- API routes return typed responses with comprehensive error handling

### Key API Endpoints
- `/api/bus-lines`: Search bus lines (with optional query parameter)
- `/api/bus-lines/nearby`: Get nearby bus lines using lat/lng
- `/api/bus-stops`: Get stops for a specific line
- `/api/bus-stops/info`: Get detailed stop information
- `/api/bus-times`: Get real-time arrivals between stops

### State Management
- Single stateful component (BusTracker) manages all application state
- State persisted in localStorage and URL parameters
- Auto-refresh every 30 seconds with countdown timer

### Important Implementation Details
- **Geolocation**: Uses Haversine formula for distance calculations
- **Search**: 300ms debounced typeahead for bus line search
- **Stop IDs**: Handle both "MTA_" prefixed and unprefixed formats
- **Direction Detection**: Automatic based on stop sequence order
- **Error Handling**: User-friendly messages for all error states

## Environment Setup

Create `.env.local` with:
```
MTA_API_KEY=your_api_key_here
```

## Development Guidelines

1. All API responses must include proper TypeScript interfaces
2. Maintain 30-minute cache for static data, 30-second for real-time data
3. Handle MTA API inconsistencies (missing data, format variations)
4. Preserve existing error handling patterns with user-friendly messages
5. Test on mobile devices - UI must be responsive
6. **NEVER fake data**: No canned data, no placeholder data, no fallback data. Always show real API responses or proper error messages. Never obfuscate failures with fake data.

## Deployment

- Deployed on Vercel at bus-time-ochre.vercel.app
- Uses Next.js Route Segment Config for serverless caching
- No external cache services required