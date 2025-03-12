# Nostr Graph Hopper

A beautiful web application that allows users to explore their Nostr social graph using the Nostr Development Kit (NDK) and NIP-07 authentication.

![Nostr Graph Hopper Screenshot](https://via.placeholder.com/800x450.png?text=Nostr+Graph+Hopper)

## Features

- **NIP-07 Authentication**: Secure login via Nostr browser extensions such as [nos2x](https://github.com/fiatjaf/nos2x), [Alby](https://getalby.com/), or other NIP-07 compatible extensions.
- **Social Graph Visualization**: Visually explore your Nostr social network with an interactive graph.
- **Interactive Graph Navigation**: Zoom, pan, and explore connections between users.
- **User Profile Details**: View detailed information about users in your network.
- **Recent Notes**: See the most recent kind1 notes from any user in the graph.
- **Dynamic Graph Expansion**: Click on any user to expand the graph and see their connections.
- **Dark Mode Support**: Beautiful interface in both light and dark modes.

## Technology Stack

- **Frontend**: Next.js with React and TypeScript
- **Styling**: Tailwind CSS for responsive design
- **Graph Visualization**: Sigma.js for high-performance graph rendering
- **Nostr Integration**: Nostr Development Kit (NDK) for Nostr protocol interaction
- **Data Storage**: NDK cache with Dexie.js for local caching

## Prerequisites

Before you start, make sure you have:

- Node.js (v16 or later)
- npm or yarn
- A Nostr-compatible browser extension (NIP-07) installed in your browser

## Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/graph-hopper.git
cd graph-hopper
```

2. Install dependencies:

```bash
npm install
# or
yarn install
```

3. Start the development server:

```bash
npm run dev
# or
yarn dev
```

4. Open your browser and navigate to [http://localhost:3000](http://localhost:3000)

## Building for Production

To create a production build:

```bash
npm run build
# or
yarn build
```

To start the production server:

```bash
npm run start
# or
yarn start
```

## Deployment

### Vercel

The easiest way to deploy your Graph Hopper application is using Vercel:

1. Push your code to a GitHub, GitLab, or Bitbucket repository
2. Import your project on [Vercel](https://vercel.com/new)
3. Vercel will automatically configure the build settings
4. Click "Deploy"

### Other Platforms

Graph Hopper can be deployed to any platform that supports Next.js applications:

- **Netlify**: Follow the [Netlify deployment guide for Next.js](https://docs.netlify.com/configure-builds/common-configurations/next-js/)
- **AWS**: Deploy using [AWS Amplify](https://docs.amplify.aws/guides/hosting/nextjs/q/platform/js/)
- **DigitalOcean**: Deploy to [DigitalOcean App Platform](https://www.digitalocean.com/community/tutorials/how-to-deploy-a-next-js-app-to-the-digitalocean-app-platform)

## Application Structure

```
graph-hopper/
├── public/              # Static files
├── src/
│   ├── app/             # Next.js App Router
│   ├── components/      # React components
│   │   ├── AuthProvider.tsx      # Authentication context
│   │   ├── Graph.tsx             # Sigma.js graph component
│   │   ├── GraphProvider.tsx     # Graph state management
│   │   ├── Header.tsx            # Application header
│   │   ├── LoginButton.tsx       # NIP-07 login button
│   │   └── NodeDetails.tsx       # Node details sidebar
│   ├── lib/             # Utility functions
│   │   ├── graph.ts              # Graph manipulation utilities
│   │   └── nostr.ts              # Nostr API functions
│   └── types/           # TypeScript type definitions
│       ├── global.d.ts           # Global type declarations
│       └── index.ts              # Interface definitions
└── ...
```

## Understanding the Codebase

### Authentication Flow

The application uses NIP-07 standard for authentication, which relies on browser extensions to provide cryptographic capabilities. The authentication flow is:

1. User clicks "Connect with Nostr" button
2. Application checks if a NIP-07 extension is available
3. If available, it requests the user's public key using `window.nostr.getPublicKey()`
4. Once authenticated, the user's social graph is loaded

### Graph Visualization

The social graph visualization is built using Sigma.js, which provides high-performance rendering capabilities:

1. The logged-in user is placed at the center of the graph
2. First-degree connections (people the user follows) are loaded and displayed
3. When a user clicks on any node, that node's connections are loaded and displayed
4. The graph expands as users explore deeper connections

### Data Handling

The application uses NDK to interact with the Nostr network:

1. User connections are fetched from kind3 events
2. User profiles are fetched and cached locally
3. Recent notes (kind1) are fetched when a user is selected

## Contributing

We welcome contributions! Please follow these steps to contribute:

1. Fork the repository
2. Create a new branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Commit your changes (`git commit -m 'Add some amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- [Nostr Development Kit (NDK)](https://github.com/nostr-dev-kit/ndk)
- [Sigma.js](https://www.sigmajs.org/) for graph visualization
- [Next.js](https://nextjs.org/) for the React framework
- [Tailwind CSS](https://tailwindcss.com/) for styling
