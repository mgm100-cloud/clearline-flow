# Clearline Flow

A hedge fund workflow management application built with React, featuring real-time stock quotes, investment idea tracking, and earnings monitoring.

## Features

- **Investment Idea Management**: Add, track, and manage investment ideas with detailed analysis
- **Idea Screening**: Filter investment ideas by characteristics (Catalysts, Characteristics, Themes) with AND logic
- **PDF Export**: Export filtered screening results with summary of selected criteria
- **Real-time Stock Quotes**: Integration with TwelveData API for live market data
- **Company Information**: AlphaVantage API integration for CIK and fiscal year-end data
- **Earnings Tracking**: Monitor upcoming earnings dates and related activities
- **Role-based Access**: Secure login with read-only and read/write permissions
- **Database Integration**: Persistent storage with Supabase
- **Team Collaboration**: Analyst assignment and team output tracking

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Market data API keys - SERVER ONLY (2026-10-21). api/market.js adds them to every vendor call; the page never
# sees them. Never give them a REACT_APP_ name: Create React App copies REACT_APP_* values into the public
# JavaScript. On Vercel, set these three as ordinary (server) environment variables.
FMP_API_KEY=your_fmp_api_key_here
TWELVE_DATA_API_KEY=your_twelve_data_api_key_here
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_api_key_here

# WebSocket relay URL (shared TwelveData connection, see server/README.md) - REQUIRED for live prices.
# If not set, live price streaming is off; prices still load over HTTP through /api/market.
REACT_APP_WS_SERVER_URL=wss://your-websocket-server.railway.app

# Supabase Configuration
REACT_APP_SUPABASE_URL=your_supabase_project_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key

# Authentication
# Password for Read/Write Access (change this to a secure password)
REACT_APP_READWRITE_PASSWORD=YourSecurePassword123!
```

Market data comes through the `/api/market` function (2026-10-21). For local development run `npm run api:dev`
next to `npm start`: it answers `/api/market` with the keys from `.env` / `.env.local` (you still sign in).
`npm run build` (`scripts/build.js`) blanks the old `REACT_APP_*_API_KEY` names for the React build and fails
if a market-data key value turns up in `build/`.

## Database Schema

### Important Field Mappings

The application uses the following database field conventions:

- **Long/Short Position**: Database field is `lsPosition` (camelCase format)
  - Values: 'Long' or 'Short'
  - Displayed as 'L' or 'S' in the UI for space efficiency

### Investment Characteristics

The Idea Screening feature uses boolean fields for investment characteristics:

**Catalysts:**
- `ma_target_buyer`, `ma_target_valuation`, `ma_target_seller`
- `big_move_revert`, `activist`, `activist_potential`
- `insider_trade_signal`, `new_mgmt`, `spin`, `big_acq`
- `self_help`, `product_cycle`, `regulation`

**Characteristics:**
- `fraud_risk`, `regulatory_risk`, `cyclical`, `non_cyclical`
- `high_beta`, `momo`, `rate_exposure`, `strong_dollar`
- `extreme_valuation`, `crapco`, `terminal_short`

**PM Flags:**
- `pm_priority`

**Themes:**
- `ai_winner`, `ai_loser`, `tariff_winner`, `tariff_loser`
- `retatrutide_winner`, `retatrutide_loser`
- `trump_winner`, `trump_loser`
- `ai_loser_seat_based`, `ai_loser_declining_employees`, `ai_loser_unemployment_spike`

## Authentication

The application has two access levels:

- **Read Only Access**: No password required, allows viewing all data but no modifications
- **Read/Write Access**: Password protected, allows full access including adding and editing investment ideas

### Security Notes

- The read/write password is stored as an environment variable
- In production, ensure you use a strong, unique password
- The password is checked client-side for simplicity, but in a production environment, consider implementing server-side authentication
- Default password is `ClearlineFlow2024!` - **change this immediately**

## Getting Started

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
