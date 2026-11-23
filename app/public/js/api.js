// Cliente HTTP: cookie de sessão httpOnly (enviado automaticamente) + header anti-CSRF
export async function api(metodo, url, corpo) {
  const opcoes = { method: metodo, credentials: 'same-origin', headers: { 'X-Requested-With': 'mentor-web' } };
  if (corpo !== undefined) {
    opcoes.headers['Content-Type'] = 'application/json';
    opcoes.body = JSON.stringify(corpo);
  }
  const resposta = await fetch(`/api${url}`, opcoes);
  let dados = null;
  if (resposta.status !== 204) {
    try { dados = await resposta.json(); } catch { dados = null; }
  }
  if (!resposta.ok) {
    const erro = new Error(dados?.erro || `Erro ${resposta.status}`);
    erro.status = resposta.status;
    erro.detalhes = dados?.detalhes;
    throw erro;
  }
  return dados;
}
