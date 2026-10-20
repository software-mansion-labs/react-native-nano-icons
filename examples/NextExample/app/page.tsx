import { Icon } from './icons';

export default function Page() {
  return (
    <main>
      <h1>Server component</h1>
      <p data-testid="inherit" style={{ fontSize: 32 }}>
        <Icon name="ic_star" /> <Icon name="ic_circle" />{' '}
        <Icon name="ic_opacity" /> <Icon name="ic_react" />{' '}
        <Icon name="ic_us_flag" /> <Icon name="ic_message" />
      </p>
      <p style={{ fontSize: 24, color: 'tomato' }}>
        Text colour <Icon name="ic_star" /> <Icon name="ic_message" /> and the
        flag keeps its colours <Icon name="ic_us_flag" />
      </p>
      <p>
        <Icon name="ic_star" size={48} color="#013369" />{' '}
        <Icon name="ic_us_flag" size={48} />{' '}
        <Icon
          name="ic_square"
          size={48}
          color={['#b31942']}
          style={[{ marginLeft: 8 }, { transform: [{ rotate: '45deg' }] }]}
        />
      </p>
    </main>
  );
}
