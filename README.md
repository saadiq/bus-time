# Bus Tracker

A real-time bus tracking application that shows arrival times for NYC buses. Try it out at [bus-time-ochre.vercel.app](https://bus-time-ochre.vercel.app/)!

## Features

- 🚍 Real-time bus tracking for any NYC bus line
- 📍 Track buses between any two stops on a route
- 🔄 Easy direction swapping to reverse your route
- ⏰ Optional arrival time checking (set a cutoff time and see which buses will arrive too late)
- 💾 Saves your preferences locally
- 📱 Mobile-friendly design

## How It Works

1. **Select a Bus Line**: Start typing a bus line (e.g., "B52") in the search box. The app will show matching bus lines.

2. **Choose Stops**: 
   - Select your origin stop from the dropdown
   - Select your destination stop from the dropdown
   - Use the swap button (↔️) to quickly reverse your route

3. **View Arrivals**:
   - See how many minutes until each bus arrives
   - View how many stops away each bus is
   - Check estimated arrival times at your destination

4. **Optional Time Check**:
   - Enable the arrival time checker
   - Set a cutoff time
   - Buses will be color-coded:
     - 🟢 Green: Will arrive well before cutoff
     - 🟡 Yellow: Cutting it close (within 20 minutes of cutoff)
     - 🔴 Red: Will arrive after cutoff

## Technical Details

- Built with Next.js and React
- Uses the MTA's OneBusAway API for real-time data
- Deployed on Vercel
- Implements client-side state persistence
- Features debounced search for bus lines
- Updates every 30 seconds automatically

## Privacy

The app stores your selected bus line and stops locally in your browser. No personal data is collected or transmitted.

## Feedback & Issues

If you encounter any issues or have suggestions, please open an issue on GitHub.

## Setup

1. Clone the repository
2. Install dependencies
   ```
   npm install
   ```
3. Create a `.env.local` file based on `.env.local.example` and add your MTA API key

## Caching Strategy

This application uses Next.js Route Segment Config for caching API responses in a serverless environment:

- Each API route uses `export const revalidate = 1800` (30 minutes) for caching static data like bus lines and stops
- Real-time data (bus arrivals) uses a shorter cache duration of 30 seconds
- The caching is handled automatically by Next.js without requiring any external services

Benefits of this approach:
- Built-in to Next.js with zero configuration
- Works seamlessly in serverless environments like Vercel
- No need for external dependencies or services
- Automatic cache invalidation based on the revalidation period

## Development

```
npm run dev
```

## Build

```
npm run build
```

## Production

```
npm start
```

## Bus Tracker Functional Specification

**1. Overview:**

The Bus Tracker is a web application designed to provide real-time arrival information for buses on a selected route and between chosen origin and destination stops. It aims to help users plan their commutes by showing estimated arrival times and potential delays.

**2. Core Features:**

*   **Route Selection:**
    *   Users can search for bus lines by name or route number (e.g., "B52").
    *   A typeahead dropdown displays matching bus lines as the user types.
    *   Users can select a bus line from the search results.
    *   Alternatively, users can use geolocation to find nearby bus lines and select one.
*   **Stop Selection:**
    *   Once a bus line is selected, the application fetches the stops for that line.
    *   Users can select an origin and a destination stop from dropdown lists.
    *   Dropdowns are populated with stops relevant to the currently selected direction.
    *   The application automatically detects the correct direction based on stop sequence or allows manual direction selection if multiple directions exist for the line.
    *   A "Swap" button allows users to quickly reverse the selected origin and destination stops and updates the direction if necessary.
*   **Arrival Time Display:**
    *   After selecting a line, origin, and destination, the application fetches and displays upcoming bus arrivals.
    *   For each arriving bus, it shows:
        *   Estimated time until arrival at the origin stop (in minutes, or "NOW").
        *   Number of stops away from the origin.
        *   Scheduled or estimated arrival time at the destination stop.
    *   Arrival times are automatically refreshed every 30 seconds.
    *   A "Last Refresh" timestamp and a countdown to the next refresh are displayed.
*   **Arrival Time Check (Optional):**
    *   Users can enable an "Arrival Time Check" feature.
    *   They can set a specific cutoff time (e.g., 08:00 AM).
    *   Buses arriving at the destination *after* the cutoff time are visually marked as "late" (red indicator).
    *   Buses arriving within 20 minutes *before* the cutoff time are visually marked with a "warning" (yellow indicator).
    *   Buses arriving before the warning threshold are marked as "normal" (green indicator).
*   **Settings Persistence:**
    *   Selected bus line, origin stop, destination stop, and cutoff settings are saved in the browser's local storage.
    *   These preferences are automatically loaded when the user revisits the application.
    *   Selections are also reflected in the URL parameters, allowing users to share or bookmark specific route views.
*   **Configuration Panel:**
    *   A collapsible "Settings" panel allows users to configure the bus line, stops, and arrival time check.
    *   A "Reset" button clears all selections, local storage, and URL parameters.
*   **Error Handling:**
    *   The application displays informative messages for errors like:
        *   Failure to fetch bus lines, stops, or arrival times.
        *   No stops found for a selected line.
        *   No buses currently scheduled.
        *   Geolocation errors (permission denied, unavailable, timeout).

**3. Technical Details:**

*   Built with Next.js and React.
*   Uses Tailwind CSS for styling and Headless UI for the toggle switch.
*   Fetches data from backend API endpoints (`/api/bus-lines`, `/api/bus-stops`, `/api/bus-times`).
*   Uses the browser's Geolocation API to find nearby routes.
*   Debounces bus line search input to limit API calls.
*   Calculates distances between coordinates using the Haversine formula to find the closest stops.
*   Handles potential inconsistencies in stop names and direction data from the API.
