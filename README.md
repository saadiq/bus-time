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

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
