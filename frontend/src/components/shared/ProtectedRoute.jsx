import React from "react";
import { Navigate } from "react-router-dom";

const ProtectedRoute = ({ currentUser, children }) => {
  if (!currentUser) {
    // Redirect to login if not authenticated
    return <Navigate to="/login" replace />;
  }

  // If authenticated, render the child component
  return children;
};

export default ProtectedRoute;
