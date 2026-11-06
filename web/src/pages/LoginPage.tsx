import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { homePathFor, useAuth } from '../lib/auth'
import { Button, Field, Input } from '../components/ui'
import { Logo } from '../components/AppShell'

export function LoginPage() {
  const { profile, loading, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!loading && profile) return <Navigate to={homePathFor(profile.role)} replace />

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(await signIn(email.trim(), password))
    setBusy(false)
  }

  return (
    <div className="min-h-full grid place-items-center px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex justify-center"><Logo large /></div>

        <div className="bg-surface rounded-2xl ring-1 ring-line shadow-raised p-7">
          <h1 className="text-xl font-semibold tracking-tight">Bienvenido de nuevo</h1>
          <p className="text-muted text-sm mt-1 mb-6">Ingresa con tu cuenta de mantenimiento.</p>

          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Correo">
              <Input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
            </Field>
            <Field label="Contraseña">
              <Input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
            </Field>
            {error && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            <Button type="submit" className="w-full h-10" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</Button>
          </form>
        </div>

        <p className="text-center text-sm text-muted mt-5">
          ¿Eres operario? <Link to="/reportar" className="text-brand font-semibold hover:underline">Reportar una falla</Link>
        </p>
      </div>
    </div>
  )
}
