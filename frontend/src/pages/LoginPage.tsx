import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authApi } from '../api/auth.api';
import { useAuthStore } from '../store/authStore';

const LP = "'Littera Plain', sans-serif";
const W = 1911;
const H = 1024;
const MOBILE_BP = 768;
const TICKER = 'загружайте свой вариант → получайте несколько по индивидуальным настройкам';

const schema = z.object({
  email: z.string().email('Введите корректный email'),
  password: z.string().min(1, 'Введите пароль'),
});

type FormData = z.infer<typeof schema>;

function fieldStyle(left: number, top: number, width: number): React.CSSProperties {
  return {
    position: 'absolute', left: `${left}px`, top: `${top}px`,
    width: `${width}px`, height: '62px', background: '#fff',
    border: '1px solid #c8c8c8', borderRadius: '31px',
    padding: '0 26px', fontSize: '22px', fontFamily: LP,
    outline: 'none', boxSizing: 'border-box', color: '#444',
  };
}

const mobileInputStyle: React.CSSProperties = {
  width: '100%', height: '44px', background: '#fff',
  border: '1px solid #c8c8c8', borderRadius: '22px',
  padding: '0 18px', fontSize: '16px', fontFamily: LP,
  outline: 'none', boxSizing: 'border-box', color: '#444',
};

export function LoginPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore(s => s.setUser);
  const [serverError, setServerError] = useState<string | null>(null);
  const [scale, setScale]       = useState(() => window.innerWidth / W);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BP);

  useEffect(() => {
    const update = () => {
      setScale(window.innerWidth / W);
      setIsMobile(window.innerWidth < MOBILE_BP);
    };
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    try {
      const user = await authApi.login(data);
      setUser(user);
      navigate('/');
    } catch {
      setServerError('Неверный email или пароль');
    }
  };

  // ── МОБИЛЬНАЯ ВЕРСИЯ ──────────────────────────────────
  if (isMobile) {
    return (
      <div style={{
        width: '100vw', minHeight: '100vh', background: '#fff',
        display: 'flex', flexDirection: 'column', fontFamily: LP,
        overflow: 'visible', position: 'relative', paddingBottom: '76px', /* ↑ лента: 76px = ~2 см от низа */
      }}>
        <img src="/belt_mob.png" alt="" aria-hidden="true" style={{
          position: 'absolute', left: '50%', top: '40%',
          transform: 'translate(-50%, -50%)',
          width: '120%', maxWidth: 'none',
          pointerEvents: 'none', userSelect: 'none',
        }} />

        {/* Шапка */}
        <div style={{ padding: '14px 12px 0', position: 'relative', zIndex: 1 }}>
          <div style={{
            background: '#fff', border: '1px solid #b4b4b4', borderRadius: '50px',
            padding: '8px 20px', boxShadow: '0 2px 4px rgba(0,0,0,.15)',
            display: 'flex', alignItems: 'center', width: '100%', boxSizing: 'border-box',
          }}>
            <img src="/logo_variantum.png" alt="ВариантУм" style={{ height: '28px', objectFit: 'contain' }} />
          </div>
        </div>

        {/* Карточка */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', /* ← центр по вертикали */
          paddingTop: '16px', paddingBottom: '16px', paddingLeft: '18px', paddingRight: '18px',
          position: 'relative', zIndex: 1,
        }}>
          <div style={{
            width: '100%', maxWidth: '340px', background: '#fdfdff',
            border: '1px solid #dadada', borderRadius: '20px',
            boxShadow: '0 4px 16px rgba(0,0,0,.10)', padding: '22px 22px 26px',
          }}>
            <p style={{ margin: '0 0 18px', fontWeight: 700, fontSize: '26px', color: '#1d5a7a', textAlign: 'center', userSelect: 'none' }}>
              Вход
            </p>

            <div style={{ marginBottom: '12px' }}>
              <p style={{ margin: '0 0 5px', fontSize: '14px', color: '#1d849f', userSelect: 'none' }}>E-mail:</p>
              <input type="email" autoComplete="email" placeholder="Ivanova@mail.ru" style={mobileInputStyle} {...register('email')} />
              {errors.email && <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#e53e3e' }}>{errors.email.message}</p>}
            </div>

            <div style={{ marginBottom: '18px' }}>
              <p style={{ margin: '0 0 5px', fontSize: '14px', color: '#1d849f', userSelect: 'none' }}>Пароль:</p>
              <input type="password" autoComplete="current-password" placeholder="Минимум 8 символов" style={mobileInputStyle} {...register('password')} />
              {errors.password && <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#e53e3e' }}>{errors.password.message}</p>}
            </div>

            {serverError && <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#e53e3e' }}>{serverError}</p>}

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div
                onClick={!isSubmitting ? handleSubmit(onSubmit) : undefined}
                style={{
                  width: '130px', height: '40px', background: '#fff',
                  border: '1.5px solid #9ec5de', borderRadius: '20px',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  userSelect: 'none', opacity: isSubmitting ? 0.6 : 1, transition: 'background .15s',
                }}
                onMouseEnter={e => { if (!isSubmitting) (e.currentTarget as HTMLElement).style.background = '#eef5f9'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
              >
                <span style={{ fontWeight: 700, fontSize: '18px', color: '#1d5a7a' }}>
                  {isSubmitting ? 'Входим...' : 'Войти'}
                </span>
              </div>
            </div>

            <Link to="/register" style={{ display: 'block', margin: '12px 0 0', fontSize: '13px', color: '#1d849f', textAlign: 'center', textDecoration: 'none', userSelect: 'none' }}>
              Нет аккаунта? <span style={{ color: '#21a038' }}>Зарегистрироваться.</span>
            </Link>
          </div>
        </div>

        {/* Тикер */}
        <div style={{ height: '36px', background: '#c4dee6', overflow: 'hidden', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ display: 'inline-flex', whiteSpace: 'nowrap', animation: 'ticker-scroll 30s linear infinite', willChange: 'transform' }}>
            {[0, 1].map(i => (
              <span key={i} style={{ fontFamily: LP, fontWeight: 700, fontSize: '22px', lineHeight: '36px', color: '#21a038', paddingRight: '60px' }}>
                {TICKER}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── ДЕСКТОПНАЯ ВЕРСИЯ ──────────────────────────────────
  const cardW = 540;
  const cardH = 515;
  const cardL = (W - cardW) / 2;
  const cardT = 215;
  const iW = cardW - 110;
  const iL = cardL + 55;
  const dy = { email: 115, pass: 232, btn: 355, link: 450 };
  const btnW = 180;
  const btnL = cardL + (cardW - btnW) / 2;

  return (
    <div style={{ width: '100vw', height: `${H * scale}px`, overflow: 'hidden', background: '#fff' }}>
      <div style={{
        position: 'relative', width: `${W}px`, height: `${H}px`,
        background: '#fff', transform: `scale(${scale})`, transformOrigin: 'top left',
      }}>

        {/* Лента */}
        <img src="/lenta.png" alt="" aria-hidden="true" style={{
          position: 'absolute', left: 0, top: '120px',
          width: '1911px', height: '562px', objectFit: 'fill',
          pointerEvents: 'none', userSelect: 'none',
        }} />

        {/* Шапка — белая таблетка */}
        <div style={{
          position: 'absolute', left: '47px', top: '40px',
          width: '1817px', height: '79px', background: '#fff',
          border: '1px solid #b4b4b4', borderRadius: '75px',
          boxShadow: '0 4px 4px rgba(0,0,0,.25)',
        }} />
        <img src="/logo_variantum.png" alt="ВариантУм" style={{
          position: 'absolute', left: '92px', top: '51px',
          height: '57px', objectFit: 'contain',
        }} />

        {/* Карточка */}
        <div style={{
          position: 'absolute', left: `${cardL}px`, top: `${cardT}px`,
          width: `${cardW}px`, height: `${cardH}px`,
          background: '#fdfdff', border: '1px solid #dadada',
          borderRadius: '32px', boxShadow: '0 4px 16px rgba(0,0,0,.10)',
        }} />

        {/* Заголовок */}
        <p style={{
          position: 'absolute', left: `${cardL}px`, top: `${cardT + 44}px`,
          width: `${cardW}px`, margin: 0,
          fontFamily: LP, fontWeight: 700, fontSize: '46px',
          color: '#1d5a7a', textAlign: 'center', userSelect: 'none',
        }}>
          Вход
        </p>

        {/* E-mail */}
        <p style={{
          position: 'absolute', left: `${iL}px`, top: `${cardT + dy.email}px`,
          margin: 0, fontFamily: LP, fontSize: '24px', color: '#1d849f', userSelect: 'none',
        }}>
          E-mail:
        </p>
        <input
          type="email"
          autoComplete="email"
          placeholder="Ivanova@mail.ru"
          style={fieldStyle(iL, cardT + dy.email + 32, iW)}
          {...register('email')}
        />
        {errors.email && (
          <p style={{ position: 'absolute', left: `${iL}px`, top: `${cardT + dy.email + 98}px`, margin: 0, fontFamily: LP, fontSize: '18px', color: '#e53e3e' }}>
            {errors.email.message}
          </p>
        )}

        {/* Пароль */}
        <p style={{
          position: 'absolute', left: `${iL}px`, top: `${cardT + dy.pass}px`,
          margin: 0, fontFamily: LP, fontSize: '24px', color: '#1d849f', userSelect: 'none',
        }}>
          Пароль:
        </p>
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Минимум 8 символов"
          style={fieldStyle(iL, cardT + dy.pass + 32, iW)}
          {...register('password')}
        />
        {errors.password && (
          <p style={{ position: 'absolute', left: `${iL}px`, top: `${cardT + dy.pass + 98}px`, margin: 0, fontFamily: LP, fontSize: '18px', color: '#e53e3e' }}>
            {errors.password.message}
          </p>
        )}

        {/* Ошибка сервера */}
        {serverError && (
          <p style={{
            position: 'absolute', left: `${iL}px`, top: `${cardT + dy.btn - 28}px`,
            margin: 0, fontFamily: LP, fontSize: '20px', color: '#e53e3e',
          }}>
            {serverError}
          </p>
        )}

        {/* Кнопка */}
        <div
          onClick={!isSubmitting ? handleSubmit(onSubmit) : undefined}
          style={{
            position: 'absolute', left: `${btnL}px`, top: `${cardT + dy.btn}px`,
            width: `${btnW}px`, height: '56px', background: '#fff',
            border: '1.5px solid #9ec5de', borderRadius: '28px',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            userSelect: 'none', opacity: isSubmitting ? 0.6 : 1,
          }}
          onMouseEnter={e => { if (!isSubmitting) (e.currentTarget as HTMLElement).style.background = '#eef5f9'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
        >
          <span style={{ fontFamily: LP, fontWeight: 700, fontSize: '32px', color: '#1d5a7a' }}>
            {isSubmitting ? 'Входим...' : 'Вход'}
          </span>
        </div>

        {/* Ссылка на регистрацию */}
        <Link
          to="/register"
          style={{
            position: 'absolute', left: `${cardL}px`, top: `${cardT + dy.link}px`,
            width: `${cardW}px`, margin: 0,
            fontFamily: LP, fontSize: '22px', color: '#1d849f',
            textAlign: 'center', cursor: 'pointer', userSelect: 'none',
            display: 'block', textDecoration: 'none',
          }}
        >
          Нет аккаунта? <span style={{ color: '#21a038' }}>Зарегистрироваться.</span>
        </Link>

        {/* Тикер */}
        <div style={{
          position: 'absolute', left: 0, top: '788px',
          width: '1911px', height: '48px', background: '#c4dee6',
          overflow: 'hidden', display: 'flex', alignItems: 'center',
        }}>
          <div style={{
            display: 'inline-flex', whiteSpace: 'nowrap',
            animation: 'ticker-scroll 30s linear infinite', willChange: 'transform',
          }}>
            {[0, 1].map(i => (
              <span key={i} style={{
                fontFamily: LP, fontWeight: 700, fontSize: '40px',
                lineHeight: '48px', color: '#21a038', paddingRight: '120px',
              }}>
                {TICKER}
              </span>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
