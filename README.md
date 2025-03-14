# 🌐 Nostr Graph Hopper

[![TypeScript](https://img.shields.io/badge/TypeScript-blue?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![D3.js](https://img.shields.io/badge/D3.js-F9A03C?style=for-the-badge&logo=d3.js&logoColor=white)](https://d3js.org/)
[![Nostr](https://img.shields.io/badge/Nostr-Protocol-purple?style=for-the-badge)](https://nostr.com/)

A beautiful, interactive web application that allows you to visually explore your Nostr social graph. Graph Hopper uses the Nostr Development Kit (NDK) and NIP-07 authentication to create a seamless experience for navigating your social connections on the Nostr network.

![Nostr Graph Hopper Screenshot](https://via.placeholder.com/800x450.png?text=Nostr+Graph+Hopper)

## ✨ Key Features

- **🔐 NIP-07 Authentication**: Secure login via Nostr browser extensions such as [nos2x](https://github.com/fiatjaf/nos2x), [Alby](https://getalby.com/), or other NIP-07 compatible extensions.
- **📊 Interactive D3 Visualization**: Powerful and smooth graph visualization using D3.js with intuitive interactions.
- **🧭 Navigation Stack**: Unique "breadcrumb" navigation system that remembers your path through the graph, allowing you to easily navigate back.
- **🔍 Interactive Graph Exploration**: Zoom, pan, and drag nodes to explore your social network in a natural way.
- **👥 Profile Details**: View detailed profile information for any user in your network.
- **📝 Live Notes Feed**: See the most recent notes from any user in the graph, updated in real-time via WebSocket subscriptions.
- **🔄 Dynamic Graph Expansion**: Click on any user to expand the graph and see their connections.
- **🔀 Follow Connections**: See who follows whom with directional connections between users.
- **🎨 Beautiful Interface**: Clean, modern UI with dark mode support and responsive design.

## 🧠 How It Works

### Navigation Stack
Graph Hopper introduces an innovative navigation system that makes exploring the Nostr social graph intuitive and memorable:

1. **Path Tracking**: As you click on different nodes, Graph Hopper maintains a "navigation stack" that tracks your journey.
2. **Contextual Exploration**: When you click on a node that's already in your navigation path, the graph is pruned to show only the relevant connections.
3. **Easy Backtracking**: Click on any node in your navigation path to jump back to that point in your exploration.
4. **Position Preservation**: Node positions are preserved between views, preventing the graph from "hopping around" and maintaining your mental map.

### Real-time Updates
Graph Hopper maintains live connections to Nostr relays, providing:

- **Live Note Feeds**: See new notes as they are published
- **Connection Updates**: New follows and connections are automatically added to the graph
- **Smooth UX**: WebSocket subscriptions ensure you always have the latest data without page refreshes

## 🛠️ Technology Stack

- **Frontend**: [Next.js](https://nextjs.org/) with React and TypeScript for a modern, type-safe codebase
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) for responsive design and dark mode support
- **Graph Visualization**: [D3.js](https://d3js.org/) for powerful, customizable graph rendering
- **Nostr Integration**: [Nostr Development Kit (NDK)](https://github.com/nostr-dev-kit/ndk) for seamless Nostr protocol interaction

## 🚀 Getting Started

### Prerequisites

Before you start, make sure you have:

- Node.js (v16 or later)
- npm or yarn
- A Nostr-compatible browser extension (NIP-07) installed in your browser

### Installation

1. Clone the repository:

```bash
git clone https://github.com/dergigi/graph-hopper.git
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

## 🏗️ Building for Production

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

## 📦 Application Structure

```
graph-hopper/
├── public/              # Static files
├── src/
│   ├── app/             # Next.js App Router
│   ├── components/      # React components
│   │   ├── AuthProvider.tsx   # Authentication context
│   │   ├── Graph.tsx          # D3.js graph component
│   │   ├── GraphProvider.tsx  # Graph state and navigation stack
│   │   ├── NodeDetails.tsx    # Node details sidebar
│   │   └── ...
│   ├── lib/             # Utility functions
│   │   ├── graph.ts           # Graph manipulation utilities
│   │   └── nostr.ts           # Nostr API and WebSocket subscriptions
│   ├── utils/           # Helper utilities
│   │   └── vertex.ts          # Nostr pubkey handling utilities
│   └── types/           # TypeScript type definitions
└── ...
```

## 🤝 Contributing

We welcome contributions! Please follow these steps to contribute:

1. Fork the repository
2. Create a new branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Commit your changes (`git commit -m 'Add some amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgements

- [Nostr Development Kit (NDK)](https://github.com/nostr-dev-kit/ndk) for Nostr protocol integration
- [D3.js](https://d3js.org/) for powerful graph visualization capabilities
- [Next.js](https://nextjs.org/) for the React framework
- [Tailwind CSS](https://tailwindcss.com/) for beautiful, responsive styling
