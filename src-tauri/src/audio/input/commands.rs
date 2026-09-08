use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Arc;
use std::thread;

use super::bridge::AudioInputBridge;
use super::engine::InputEngine;
use super::types::{InputDevice, InputStatus};

pub(crate) enum AudioInputCommand {
    List(Sender<Vec<InputDevice>>),
    Refresh(Sender<Vec<InputDevice>>),
    GetDevice(Sender<Option<String>>),
    SetDevice(Option<String>, Sender<Result<(), String>>),
    GetChannel(Sender<Option<u16>>),
    SetChannel(Option<u16>, Sender<Result<(), String>>),
    Start(Sender<Result<(), String>>),
    Stop(Sender<Result<(), String>>),
    GetStatus(Sender<InputStatus>),
}

pub(crate) fn spawn_input_engine(bridge: Arc<AudioInputBridge>) -> Sender<AudioInputCommand> {
    let (tx, rx): (Sender<AudioInputCommand>, Receiver<AudioInputCommand>) = channel();
    thread::spawn(move || {
        let mut engine = InputEngine::new(bridge);
        while let Ok(command) = rx.recv() {
            match command {
                AudioInputCommand::List(reply) => {
                    let _ = reply.send(engine.list_devices());
                }
                AudioInputCommand::Refresh(reply) => {
                    let _ = reply.send(engine.refresh_devices());
                }
                AudioInputCommand::GetDevice(reply) => {
                    let _ = reply.send(engine.selected_device());
                }
                AudioInputCommand::SetDevice(id, reply) => {
                    let _ = reply.send(engine.set_device(id));
                }
                AudioInputCommand::GetChannel(reply) => {
                    let _ = reply.send(engine.selected_channel());
                }
                AudioInputCommand::SetChannel(channel, reply) => {
                    let _ = reply.send(engine.set_channel(channel));
                }
                AudioInputCommand::Start(reply) => {
                    let _ = reply.send(engine.start());
                }
                AudioInputCommand::Stop(reply) => {
                    let _ = reply.send(engine.stop());
                }
                AudioInputCommand::GetStatus(reply) => {
                    let _ = reply.send(engine.status());
                }
            }
        }
    });
    tx
}
