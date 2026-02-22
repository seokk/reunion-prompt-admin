
# Blueprint: Prompt Manager

## Overview
A single-page application for viewing and managing prompts. Users can see a list of prompts, view the detailed content of each prompt, and edit the content directly. Changes are saved to a database. The application is optimized for speed and scalability, built to be deployed on modern serverless platforms like Firebase Hosting.

## Implemented Features

*   **Initial Setup:** A two-column layout showing a list of prompts on the left and the content of the selected prompt on the right.
*   **Permanent Storage with Server Actions:** Data is fetched and updated from a Turso database. Data mutations are handled securely via Next.js Server Actions.

## Current Plan: Refactor for Firebase Hosting Compatibility (Completed)

### Overview
To make the application fully compatible with static hosting platforms like Firebase, we refactored the data-fetching mechanism. Instead of fetching data on the server at build time, the application now loads a static shell first and then fetches data from a dedicated API route on the client-side. This results in faster initial page loads and better scalability.

### Implementation Steps (Completed)

1.  **Create API Route (`app/api/prompts/route.ts`):**
    *   Created a new API endpoint responsible for securely querying the database and returning the list of prompts as JSON.
    *   Implemented `revalidate = 60` to cache the API response for 60 seconds, reducing unnecessary database queries.

2.  **Refactor Root Page (`app/page.tsx`):**
    *   Removed all server-side data fetching logic from the page component.
    *   The page now acts as a pure static "shell," which can be prerendered and served instantly.

3.  **Refactor Client Component (`app/prompts/manager.tsx`):**
    *   Modified the component to fetch its own data from the `/api/prompts` endpoint on the client-side.
    *   Used `useEffect` and `useState` hooks to manage the data fetching, loading, and error states.
    *   The component now displays a "Loading..." message while fetching data, providing a better user experience.

## Next Step: Build and Deploy to Firebase

We will now proceed with building the application and deploying it to Firebase Hosting.
