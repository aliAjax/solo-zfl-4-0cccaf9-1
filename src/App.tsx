import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import Toaster from "@/components/Toaster";
import ErrorBoundary from "@/components/ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Toaster />
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}
