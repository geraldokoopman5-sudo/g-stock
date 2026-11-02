import { useState } from 'react'
import './App.css'

function App() {
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')

  return (
    <div className="login-page">
      <div className="login-layout">
        <section className="welcome" aria-label="G-Stock workspace">
          <a className="brand" href="./" aria-label="G-Stock home">
            <span className="brand-mark" aria-hidden="true">G</span>
            <span>G-Stock</span>
          </a>
          <div className="welcome-content">
            <p className="eyebrow">YOUR OPERATIONS, CONNECTED</p>
            <h1>Everything<br />in its place.</h1>
            <div className="monogram" aria-hidden="true">GS</div>
            <p className="welcome-description">Stay on top of stock.<br />Keep orders moving.</p>
          </div>
          <footer>G-Stock <span aria-hidden="true">·</span> Staff workspace</footer>
        </section>

        <main className="login-card">
          <p className="eyebrow">WORKSPACE ACCESS</p>
          <h2>Sign in</h2>
          <p className="login-intro">Welcome back to G-Stock.</p>
          <form onSubmit={(event) => {
            event.preventDefault()
            setMessage('Sign-in is not connected yet. Your account details have not been sent.')
          }}>
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input id="email" name="email" type="email" placeholder="you@company.co.za" autoComplete="username" required />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="password-field">
                <input id="password" name="password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" autoComplete="current-password" required />
                <button type="button" className="password-toggle" aria-controls="password" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button>
              </div>
            </div>
            <div className="login-options">
              <label className="remember"><input type="checkbox" name="remember" /> Remember me</label>
            </div>
            <button className="sign-in" type="submit">Sign in <span aria-hidden="true">→</span></button>
            <p className="form-message" role="status">{message}</p>
          </form>
          <p className="staff-note">Staff access only <span aria-hidden="true">·</span> Contact your administrator</p>
        </main>
      </div>
    </div>
  )
}

export default App
