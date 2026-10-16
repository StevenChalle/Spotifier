import { Navigate, Route, Routes } from 'react-router'
import Layout from './components/Layout'
import CallbackPage from './pages/CallbackPage'
import CreateFromLikesPage from './pages/CreateFromLikesPage'
import LoginPage from './pages/LoginPage'
import PlaylistsPage from './pages/PlaylistsPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/callback" element={<CallbackPage />} />
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/playlists" replace />} />
        <Route path="/playlists" element={<PlaylistsPage />} />
        <Route path="/create" element={<CreateFromLikesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/playlists" replace />} />
    </Routes>
  )
}

export default App
