import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const withAuth = (WrappedComponent) => {
  const AuthComponent = (props) => {
    const navigate = useNavigate();

    const isAuthenticated = () => {
      // Checks if the token is present in localStorage
      return Boolean(localStorage.getItem("token"));
    };

    useEffect(() => {
      // Redirect to login page if user is not authenticated
      if (!isAuthenticated()) {
        navigate("/auth");
      }
    }, [navigate]); // Adding `navigate` to dependency array to avoid potential bugs

    // Only render the wrapped component if authenticated
    return isAuthenticated() ? <WrappedComponent {...props} /> : null;
  };

  return AuthComponent;
};

export default withAuth;
