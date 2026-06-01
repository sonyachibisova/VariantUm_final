import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const LP = "'Littera Plain', sans-serif";
const W = 1911;
const H = 1024;
const MOBILE_BP = 768;

const TICKER = 'загружайте свой вариант → получайте несколько по индивидуальным настройкам';

export function StartPage() {
  const navigate = useNavigate();
  const [vw, setVw] = useState(() => window.innerWidth);

  useEffect(() => {
    const update = () => setVw(window.innerWidth);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  if (vw < MOBILE_BP) {
    return <MobilePage navigate={navigate} />;
  }

  const scale = vw / W;

  return (
    <div style={{ width: '100vw', height: `${H * scale}px`, overflow: 'hidden', background: '#fff' }}>
      <div style={{
        position: 'relative',
        width: `${W}px`,
        height: `${H}px`,
        background: '#fff',
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }}>

        {/* Лента — фоновый декоративный элемент */}
        <img
          src="/lenta.png"
          alt=""
          aria-hidden="true"
          style={{
            position: 'absolute', left: 0, top: '120px',
            width: '1911px', height: '562px',
            objectFit: 'fill', pointerEvents: 'none', userSelect: 'none',
          }}
        />

        {/* Шапка — белая таблетка */}
        <div style={{
          position: 'absolute', left: '47px', top: '40px',
          width: '1817px', height: '79px',
          background: '#fff', border: '1px solid #b4b4b4',
          borderRadius: '75px', boxShadow: '0 4px 4px rgba(0,0,0,.25)',
        }} />
        <img
          src="/logo_sber.png"
          alt="Сбер"
          style={{
            position: 'absolute', left: '92px', top: '51px',
            height: '57px', objectFit: 'contain',
          }}
        />

        {/* Логотип «вариантУм» */}
        <img
          src="/logo_variantum.png"
          alt="ВариантУм"
          style={{
            position: 'absolute', left: '460px', top: '255px',
            width: '680px', objectFit: 'contain',
          }}
        />

        {/* Подзаголовок */}
        <p style={{
          position: 'absolute', left: '463px', top: '430px',
          width: '680px', margin: 0,
          fontFamily: LP, fontWeight: 400, fontSize: '36px',
          lineHeight: '0.85', color: '#1d5a7a', textAlign: 'left', userSelect: 'none',
        }}>
          ИИ-генератор<br />вариантов заданий
        </p>

        {/* Кнопка «перейти к регистрации» */}
        <div
          onClick={() => navigate('/register')}
          style={{
            position: 'absolute', left: '455px', top: '550px',
            width: '440px', height: '74px',
            background: '#fff', border: '1px solid #b4b4b4',
            borderRadius: '50px', boxShadow: '0 4px 4px rgba(0,0,0,.25)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            userSelect: 'none', transition: 'background .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#eef5f9')}
          onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
        >
          <span style={{
            fontFamily: LP, fontWeight: 700, fontSize: '37px',
            color: '#1d5a7a', whiteSpace: 'nowrap',
          }}>
            перейти к регистрации
          </span>
        </div>

        {/* Тикер — синяя лента внизу */}
        <div style={{
          position: 'absolute', left: 0, top: '788px',
          width: '1911px', height: '48px',
          background: '#c4dee6', overflow: 'hidden',
          display: 'flex', alignItems: 'center',
        }}>
          <div style={{
            display: 'inline-flex', whiteSpace: 'nowrap',
            animation: 'ticker-scroll 30s linear infinite',
            willChange: 'transform',
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

function MobilePage({ navigate }: { navigate: (path: string) => void }) {
  return (
    <div style={{
      width: '100vw', minHeight: '100svh',
      background: '#fff', position: 'relative', overflow: 'hidden',
    }}>

      {/* Лента — фоновый декоративный элемент */}
      <img
        src="/belt_mob.png"
        alt=""
        aria-hidden="true"
        style={{
          position: 'absolute', left: '50%', top: '40%',
          transform: 'translate(-50%, -50%)',
          width: '120%', maxWidth: 'none',
          pointerEvents: 'none', userSelect: 'none',
        }}
      />

      {/* Шапка — белая таблетка */}
      <div style={{
        position: 'absolute', left: '16px', top: '14px',
        right: '16px', height: '52px',
        background: '#fff', border: '1px solid #b4b4b4',
        borderRadius: '50px', boxShadow: '0 4px 4px rgba(0,0,0,.25)',
      }} />
      <img
        src="/logo_sber.png"
        alt="Сбер"
        style={{
          position: 'absolute', left: '36px', top: '21px',
          height: '38px', objectFit: 'contain',
        }}
      />

      {/* Логотип «вариантУм» */}
      <img
        src="/logo_variantum.png"
        alt="ВариантУм"
        style={{
          position: 'absolute', left: '24px', top: '210px',
          width: 'min(72vw, 310px)', objectFit: 'contain',
        }}
      />

      {/* Подзаголовок */}
      <p style={{
        position: 'absolute', left: '24px', top: '290px',
        margin: 0,
        fontFamily: LP, fontWeight: 400, fontSize: '19px',
        lineHeight: '1.25', color: '#1d5a7a', userSelect: 'none',
      }}>
        ИИ-генератор<br />вариантов заданий
      </p>

      {/* Кнопка «перейти к регистрации» */}
      <div
        onClick={() => navigate('/register')}
        style={{
          position: 'absolute', left: '24px', top: '374px',
          width: '218px', height: '46px',
          background: '#fff', border: '1px solid #b4b4b4',
          borderRadius: '50px', boxShadow: '0 4px 4px rgba(0,0,0,.25)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          userSelect: 'none',
        }}
        onTouchStart={e => (e.currentTarget.style.background = '#eef5f9')}
        onTouchEnd={e => (e.currentTarget.style.background = '#fff')}
      >
        <span style={{
          fontFamily: LP, fontWeight: 700, fontSize: '18px',
          color: '#1d5a7a', whiteSpace: 'nowrap',
        }}>
          перейти к регистрации
        </span>
      </div>

      {/* Тикер — синяя лента */}
      <div style={{
        position: 'absolute', left: 0, bottom: '76px',
        width: '100%', height: '36px',
        background: '#c4dee6', overflow: 'hidden',
        display: 'flex', alignItems: 'center',
      }}>
        <div style={{
          display: 'inline-flex', whiteSpace: 'nowrap',
          animation: 'ticker-scroll 30s linear infinite',
          willChange: 'transform',
        }}>
          {[0, 1].map(i => (
            <span key={i} style={{
              fontFamily: LP, fontWeight: 700, fontSize: '22px',
              lineHeight: '36px', color: '#21a038', paddingRight: '80px',
            }}>
              {TICKER}
            </span>
          ))}
        </div>
      </div>

    </div>
  );
}
