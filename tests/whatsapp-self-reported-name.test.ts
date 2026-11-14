import assert from "node:assert/strict";
import test from "node:test";

import {
  extractSelfReportedName,
  isPhoneLikeName,
} from "../supabase/functions/_shared/whatsapp-self-reported-name.ts";

test("extrai nome de apresentações explícitas", () => {
  assert.equal(extractSelfReportedName("Me chamo Ana"), "Ana");
  assert.equal(extractSelfReportedName("Olá! Meu nome é João Silva, quero info"), "João Silva");
  assert.equal(extractSelfReportedName("meu nome e Carla Souza."), "Carla Souza");
  assert.equal(extractSelfReportedName("Meu nome é: Pedro"), "Pedro");
});

test("corta a frase quando ela continua depois do nome", () => {
  assert.equal(
    extractSelfReportedName("meu nome é João e quero saber o preço"),
    "João",
  );
  assert.equal(
    extractSelfReportedName("Me chamo Maria Lima vi o anúncio de vocês"),
    "Maria Lima",
  );
});

test("não transforma mensagens comuns em nome", () => {
  for (const message of [
    "Tenho interesse",
    "Quero saber o preço",
    "eu sou cliente de vocês",
    "Sou interessado no curso",
    "aqui é da empresa Alfa",
    "sou de São Paulo",
    "Pode me ligar",
    "pode me chamar no whats",
    "Maria",
    "Bom dia",
    "",
  ]) {
    assert.equal(extractSelfReportedName(message), null, message);
  }
  assert.equal(extractSelfReportedName(null), null);
});

test("ignora prefixo de mídia", () => {
  assert.equal(extractSelfReportedName("[Áudio] me chamo Bruno"), "Bruno");
});

test("isPhoneLikeName identifica nome que é o telefone", () => {
  assert.equal(isPhoneLikeName("5511999998888", "5511999998888"), true);
  assert.equal(isPhoneLikeName("+55 (11) 99999-8888", "5511999998888"), true);
  assert.equal(isPhoneLikeName("999998888", "5511999998888"), true);
  assert.equal(isPhoneLikeName("", "5511999998888"), true);
  assert.equal(isPhoneLikeName(null, "5511999998888"), true);
  assert.equal(isPhoneLikeName("Maria Silva", "5511999998888"), false);
  assert.equal(isPhoneLikeName("Lead 5511999998888", "5511999998888"), false);
  assert.equal(isPhoneLikeName("5521888887777", "5511999998888"), false);
});
