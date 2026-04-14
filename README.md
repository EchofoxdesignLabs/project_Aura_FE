# Project Aura — Frontend

<div align="center">

![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black)
![Phaser](https://img.shields.io/badge/Phaser-8255D0?style=flat-square&logo=phaser&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-47848F?style=flat-square&logo=electron&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-443E38?style=flat-square&logo=react&logoColor=white)

**The immersive spatial interface for Project Aura. Built with React for UI, Phaser 3 for movement, and native WebRTC for proximity-based communication.**

</div>

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Development](#development)
- [Electron (Desktop)](#electron-desktop)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)

---

## Overview

Project Aura Frontend is a high-performance, real-time virtual office client. It combines the declarative power of **React 19** for complex UI management with the high-performance rendering of **Phaser 3** for the spatial 2D office environment.

Users can move around a canvases, interact with objects, and automatically engage in voice/video calls when approaching colleagues or entering designated meeting zones.

---

## Key Features

-   **Spatial Movement**: Smooth 2D movement powered by Phaser 3.
-   **Proximity Audio/Video**: Dynamic volume and spatialization based on distances to other players.
-   **Meeting Rooms**: Automatic transition to grid-based conferencing when entering meeting zones.
-   **Hybrid Application**: Run in a standard web browser or as a native desktop application via Electron.
-   **Real-time Synchronization**: Powered by Socket.IO for minimal latency.
-   **Responsive Design**: Fully styled with Tailwind CSS for a premium, modern feel.

---

## Tech Stack

| Layer            | Technology                                |
| ---------------- | ----------------------------------------- |
| **Framework**    | [React 19](https://react.dev/)            |
| **Game Engine**  | [Phaser 3.90](https://phaser.io/)         |
| **Build Tool**   | [Vite 7](https://vitejs.dev/)             |
| **Styling**      | [Tailwind CSS 4](https://tailwindcss.com/)|
| **State**        | [Zustand](https://zustand-demo.pmnd.rs/)  |
| **Desktop**      | [Electron 39](https://www.electronjs.org/)|
| **Real-time**    | [Socket.IO Client 4](https://socket.io/)  |
| **Communication**| Native WebRTC (Proximity/Conferencing)    |

---

## Architecture

The application uses a **Bridge Pattern** between React and Phaser:

1.  **Zustand Store**: Acts as the single source of truth for both React and Phaser.
2.  **React Layer**: Handles overlays, menus, chat, settings, and conferencing grids.
3.  **Phaser Layer**: Handles player movement, animations, map rendering, and spatial audio calculations.
4.  **Socket.IO**: Synchronizes player state with the `aura-realtime` backend.

---

## Getting Started

### Prerequisites

-   **Node.js**: ≥ 20
-   **npm**: ≥ 10
-   **Backend**: Ensure the [Project Aura Backend](https://github.com/EchofoxdesignLabs/project-aura) is running.

### Installation

```bash
git clone https://github.com/EchofoxdesignLabs/project-aura-fe.git
cd project-aura-fe
npm install
```

### Environment Variables

Copy the example file and update it with your backend URLs:

```bash
cp .env.example .env
```

Required variables:
- `VITE_API_URL`: URL of the `aura-api` (e.g., `http://localhost:3000`)
- `VITE_WS_URL`: URL of the `aura-realtime` gateway (e.g., `http://localhost:3001`)

---

## Development

### Run Web Client (Dev Mode)

```bash
npm run dev
```
The app will be available at `http://localhost:5173`.

### Run Desktop Client (Electron)

```bash
npm run electron:dev
```

### Build for Production

```bash
# Web
npm run build

# Desktop
npm run electron:build
```

---

## Project Structure

```text
project-aura-fe/
├── src/
│   ├── components/       # Reusable UI primitives (Buttons, Inputs, etc.)
│   ├── game/             # Phaser 3 logic (Scenes, Sprites, Managers)
│   │   ├── scenes/       # MainScene, BootstrapScene, etc.
│   │   └── PhaserGame.ts # React component wrapper for Phaser
│   ├── hooks/            # Custom React hooks
│   ├── services/         # API and Socket.IO services
│   ├── stores/           # Zustand state management (auth, game, etc.)
│   ├── types/            # TypeScript interfaces
│   └── App.tsx           # Root component
├── electron/             # Electron main process and configuration
├── public/               # Static assets (maps, sprites, audio)
└── index.html
```

---

## License

Copyright © 2026 Echofox Design Labs. All rights reserved.
