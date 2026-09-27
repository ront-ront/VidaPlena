"use client";

import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Eye,
  EyeOff,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Image from "next/image";

type FieldErrors = {
  email?: string;
  password?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors: FieldErrors = {};
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      errors.email = "Informe seu e-mail.";
    } else if (!emailPattern.test(normalizedEmail)) {
      errors.email = "Digite um e-mail válido.";
    }

    if (!password) {
      errors.password = "Informe sua senha.";
    }

    setFieldErrors(errors);
    setFormMessage("");

    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    window.setTimeout(() => {
      setIsSubmitting(false);
      setFormMessage(
        "Formulário validado. A autenticação será conectada em seguida.",
      );
    }, 650);
  }

  function handleForgotPassword() {
    setFormMessage(
      "A recuperação de senha ficará disponível após a integração do fluxo de autenticação.",
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute -left-32 top-20 size-80 rounded-full bg-[radial-gradient(circle,var(--accent),transparent_68%)] opacity-80" />
      <div className="pointer-events-none absolute -right-32 bottom-0 size-96 rounded-full bg-[radial-gradient(circle,var(--secondary),transparent_68%)] opacity-80" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-360 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(440px,560px)]">
        <section className="flex flex-col px-6 pb-10 pt-8 sm:px-10 sm:pt-10 lg:justify-center lg:px-16 lg:py-16">
          <div className="mx-auto w-full max-w-xl lg:mx-0">
            <div className="mb-16 flex items-center gap-3 lg:mb-24">
              {/* <div className="relative flex size-10.5 shrink-0 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,var(--vida-mint),var(--vida-blue)_52%,var(--vida-blue-deep))] shadow-(--shadow-2)"> */}
                <Image src="/logo.png" alt="Vida Plena Logo" width={58} height={58} />
              {/* </div> */}
              <span className="font-heading text-2xl font-bold tracking-tight">
                <span className="text-vida-blue">Vida</span>
                <span className="text-vida-mint">Plena</span>
              </span>
            </div>

            <div className="max-w-lg">
              <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-vida-blue">
                <span className="size-1.5 rounded-full bg-vida-mint" />
                Cuidado conectado
              </p>
              <h1 className="max-w-xl text-4xl font-bold leading-tight tracking-[-0.04em] text-foreground sm:text-5xl sm:leading-[1.12]">
                Um espaço para cuidar do que realmente importa.
              </h1>
              <p className="mt-6 max-w-md text-base leading-7 text-muted-foreground">
                Acompanhe sua jornada de cuidado com clareza, segurança e uma
                experiência feita para colocar você no centro.
              </p>
            </div>

            <div className="mt-12 flex items-center gap-3 text-sm text-muted-foreground">
              <div className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <ShieldCheck aria-hidden="true" className="size-5" />
              </div>
              <span>Seus dados tratados com cuidado e privacidade.</span>
            </div>
          </div>
        </section>

        <section className="flex items-center px-4 pb-10 sm:px-8 lg:px-10 lg:py-10">
          <div className="w-full rounded-2xl border border-border bg-card p-6 shadow-(--shadow-2) sm:p-8">
            <div className="mb-8">
              <p className="mb-3 text-sm font-semibold text-vida-blue">
                Acesse sua conta
              </p>
              <h2 className="text-2xl font-bold tracking-tight text-card-foreground sm:text-3xl">
                Bem-vindo de volta
              </h2>
              <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
                Entre para continuar sua jornada de cuidado no Vida Plena.
              </p>
            </div>

            <form className="space-y-5" noValidate onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label
                  className="text-sm font-semibold text-card-foreground"
                  htmlFor="email"
                >
                  E-mail
                </label>
                <input
                  aria-describedby={
                    fieldErrors.email ? "email-error" : undefined
                  }
                  aria-invalid={Boolean(fieldErrors.email)}
                  autoComplete="email"
                  className={cn(
                    "h-11 w-full rounded-[10px] border border-input bg-background px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus:border-ring focus:ring-3 focus:ring-ring/20",
                    fieldErrors.email &&
                      "border-destructive focus:border-destructive focus:ring-destructive/20",
                  )}
                  id="email"
                  name="email"
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (fieldErrors.email) {
                      setFieldErrors((current) => ({
                        ...current,
                        email: undefined,
                      }));
                    }
                  }}
                  placeholder="seu@email.com"
                  type="email"
                  value={email}
                />
                {fieldErrors.email && (
                  <p
                    className="flex items-center gap-1.5 text-xs text-destructive"
                    id="email-error"
                  >
                    <CircleAlert aria-hidden="true" className="size-3.5" />
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <label
                    className="text-sm font-semibold text-card-foreground"
                    htmlFor="password"
                  >
                    Senha
                  </label>
                  <button
                    className="text-xs font-semibold cursor-pointer text-primary underline-offset-4 transition-colors hover:text-vida-blue hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                    onClick={handleForgotPassword}
                    type="button"
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <div className="relative">
                  <input
                    aria-describedby={
                      fieldErrors.password ? "password-error" : undefined
                    }
                    aria-invalid={Boolean(fieldErrors.password)}
                    autoComplete="current-password"
                    className={cn(
                      "h-11 w-full rounded-[10px] border border-input bg-background px-3 pr-11 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus:border-ring focus:ring-3 focus:ring-ring/20",
                      fieldErrors.password &&
                        "border-destructive focus:border-destructive focus:ring-destructive/20",
                    )}
                    id="password"
                    name="password"
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (fieldErrors.password) {
                        setFieldErrors((current) => ({
                          ...current,
                          password: undefined,
                        }));
                      }
                    }}
                    placeholder="Digite sua senha"
                    type={showPassword ? "text" : "password"}
                    value={password}
                  />
                  <button
                    aria-label={
                      showPassword ? "Ocultar senha" : "Mostrar senha"
                    }
                    className="absolute cursor-pointer right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                    onClick={() => setShowPassword((current) => !current)}
                    type="button"
                  >
                    {showPassword ? (
                      <EyeOff aria-hidden="true" className="size-4" />
                    ) : (
                      <Eye aria-hidden="true" className="size-4" />
                    )}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p
                    className="flex items-center gap-1.5 text-xs text-destructive"
                    id="password-error"
                  >
                    <CircleAlert aria-hidden="true" className="size-3.5" />
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              <Button
                className="h-12 w-full rounded-[11px] text-sm font-semibold shadow-(--shadow-1)"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? (
                  <>
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                    Validando...
                  </>
                ) : (
                  <>
                    Entrar
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </>
                )}
              </Button>

              {formMessage && (
                <p
                  aria-live="polite"
                  className="flex items-start gap-2 rounded-xl bg-accent px-3 py-2.5 text-xs leading-5 text-accent-foreground"
                  role="status"
                >
                  <CheckCircle2
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                  />
                  <span>{formMessage}</span>
                </p>
              )}
            </form>

            <p className="mt-8 text-center text-xs leading-5 text-muted-foreground">
              Ao continuar, você concorda com nossas diretrizes de privacidade e
              cuidado.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
